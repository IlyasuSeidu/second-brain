import { Prisma, ThoughtEventType, ThoughtStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "./prisma";

import type { UrgencyLevel } from "@prisma/client";

const evaluateThoughtInputSchema = z.object({
  thoughtId: z.string().uuid(),
});

const topCandidatesInputSchema = z.object({
  userId: z.string().uuid(),
  limit: z.number().int().min(1).max(50),
});

export const RESURFACING_WEIGHTS = {
  AGE_CAP_DAYS: 30,
  AGE_PER_DAY: 1.2,
  URGENCY: {
    LOW: 4,
    MEDIUM: 10,
    HIGH: 18,
  },
  STATUS: {
    CAPTURED: 12,
    PLANNED: 4,
    COMPLETED: -30,
    ARCHIVED: -45,
  },
  REMINDER_PRESENT: -6,
  RECENT_RESURFACED_WINDOW_DAYS: 3,
  RECENT_RESURFACED_PENALTY: -20,
  SCORE_MIN: 0,
  SCORE_MAX: 100,
} as const;

type ResurfacingScoringInput = {
  createdAt: Date;
  urgencyLevel: UrgencyLevel;
  hasReminder: boolean;
  status: ThoughtStatus;
  lastResurfacedAt: Date | null;
  now: Date;
};

export type ResurfacingScoreResult = {
  score: number;
  reason: string;
  components: {
    age: number;
    urgency: number;
    reminder: number;
    status: number;
    recentResurfaced: number;
  };
};

const clampScore = (score: number): number => {
  return Math.max(RESURFACING_WEIGHTS.SCORE_MIN, Math.min(RESURFACING_WEIGHTS.SCORE_MAX, score));
};

const daysBetween = (from: Date, to: Date): number => {
  const diffMs = to.getTime() - from.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
};

const isWithinRecentWindow = (date: Date | null, now: Date): boolean => {
  if (!date) {
    return false;
  }

  const daysSinceResurfaced = daysBetween(date, now);
  return daysSinceResurfaced <= RESURFACING_WEIGHTS.RECENT_RESURFACED_WINDOW_DAYS;
};

const isForeignKeyConstraintError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

export const computeResurfacingScore = (input: ResurfacingScoringInput): ResurfacingScoreResult => {
  const ageDays = daysBetween(input.createdAt, input.now);
  const ageComponent =
    Math.min(ageDays, RESURFACING_WEIGHTS.AGE_CAP_DAYS) * RESURFACING_WEIGHTS.AGE_PER_DAY;

  const urgencyComponent = RESURFACING_WEIGHTS.URGENCY[input.urgencyLevel];
  const reminderComponent = input.hasReminder ? RESURFACING_WEIGHTS.REMINDER_PRESENT : 0;
  const statusComponent = RESURFACING_WEIGHTS.STATUS[input.status];
  const recentResurfacedComponent = isWithinRecentWindow(input.lastResurfacedAt, input.now)
    ? RESURFACING_WEIGHTS.RECENT_RESURFACED_PENALTY
    : 0;

  const total = clampScore(
    ageComponent +
      urgencyComponent +
      reminderComponent +
      statusComponent +
      recentResurfacedComponent,
  );

  const score = Number(total.toFixed(2));
  const reason = `age=${ageComponent.toFixed(2)};urgency=${urgencyComponent};reminder=${reminderComponent};status=${statusComponent};recent=${recentResurfacedComponent};score=${score}`;

  return {
    score,
    reason,
    components: {
      age: Number(ageComponent.toFixed(2)),
      urgency: urgencyComponent,
      reminder: reminderComponent,
      status: statusComponent,
      recentResurfaced: recentResurfacedComponent,
    },
  };
};

const withResurfacingIncludes = {
  reminders: {
    select: {
      id: true,
      thoughtId: true,
      scheduledFor: true,
      sentAt: true,
      status: true,
      createdAt: true,
    },
  },
  thoughtEvents: {
    where: {
      eventType: ThoughtEventType.RESURFACED,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
} as const;

type ThoughtWithResurfacingContext = Prisma.ThoughtGetPayload<{
  include: typeof withResurfacingIncludes;
}>;

export type ResurfacingCandidate = ThoughtWithResurfacingContext & {
  resurfacingScore: number;
  resurfacingReason: string;
};

export type EvaluatedResurfacingSignal = {
  thoughtId: string;
  score: number;
  reason: string;
  lastEvaluatedAt: Date;
};

export type ResurfacingServicePrisma = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

type ResurfacingServiceDependencies = {
  prismaClient: ResurfacingServicePrisma;
  nowProvider: () => Date;
};

type TopResurfacingOptions = {
  emitEvents?: boolean;
  eventSource?: string;
};

const scoreThought = (
  thought: ThoughtWithResurfacingContext,
  now: Date,
): ResurfacingScoreResult => {
  return computeResurfacingScore({
    createdAt: thought.createdAt,
    urgencyLevel: thought.urgencyLevel,
    hasReminder: thought.reminders.length > 0,
    status: thought.status,
    lastResurfacedAt: thought.thoughtEvents[0]?.createdAt ?? null,
    now,
  });
};

const upsertResurfacingSignal = async (
  tx: Prisma.TransactionClient,
  thoughtId: string,
  scoreResult: ResurfacingScoreResult,
  now: Date,
): Promise<void> => {
  const updated = await tx.resurfacingSignal.updateMany({
    where: { thoughtId },
    data: {
      score: scoreResult.score,
      reason: scoreResult.reason,
      lastEvaluatedAt: now,
    },
  });

  if (updated.count > 0) {
    return;
  }

  try {
    await tx.resurfacingSignal.create({
      data: {
        thoughtId,
        score: scoreResult.score,
        reason: scoreResult.reason,
        lastEvaluatedAt: now,
      },
    });
  } catch (error: unknown) {
    if (!isForeignKeyConstraintError(error)) {
      throw error;
    }
  }
};

export class ResurfacingService {
  private readonly prismaClient: ResurfacingServicePrisma;
  private readonly nowProvider: () => Date;

  constructor({ prismaClient, nowProvider }: ResurfacingServiceDependencies) {
    this.prismaClient = prismaClient;
    this.nowProvider = nowProvider;
  }

  async evaluateThought(thoughtId: string): Promise<EvaluatedResurfacingSignal> {
    const input = evaluateThoughtInputSchema.parse({ thoughtId });
    const now = this.nowProvider();

    return this.prismaClient.$transaction(async (tx) => {
      const thought = await tx.thought.findUniqueOrThrow({
        where: { id: input.thoughtId },
        include: withResurfacingIncludes,
      });

      const scoreResult = scoreThought(thought, now);
      await upsertResurfacingSignal(tx, thought.id, scoreResult, now);

      return {
        thoughtId: thought.id,
        score: scoreResult.score,
        reason: scoreResult.reason,
        lastEvaluatedAt: now,
      };
    });
  }

  async getTopResurfacingCandidates(
    userId: string,
    limit: number,
    options: TopResurfacingOptions = {},
  ): Promise<ResurfacingCandidate[]> {
    const input = topCandidatesInputSchema.parse({ userId, limit });
    const now = this.nowProvider();
    const emitEvents = options.emitEvents ?? true;
    const eventSource = options.eventSource ?? "resurfacing_engine";

    return this.prismaClient.$transaction(async (tx) => {
      const thoughts = await tx.thought.findMany({
        where: {
          userId: input.userId,
          status: ThoughtStatus.CAPTURED,
        },
        include: withResurfacingIncludes,
      });

      const evaluated = thoughts.map((thought) => {
        const scoreResult = scoreThought(thought, now);
        return {
          thought,
          scoreResult,
        };
      });

      await Promise.all(
        evaluated.map(async ({ thought, scoreResult }) => {
          await upsertResurfacingSignal(tx, thought.id, scoreResult, now);
        }),
      );

      const topCandidates = [...evaluated]
        .sort((left, right) => right.scoreResult.score - left.scoreResult.score)
        .slice(0, input.limit);

      if (emitEvents && topCandidates.length > 0) {
        const eventCandidates = topCandidates.filter(({ thought }) => {
          return !isWithinRecentWindow(thought.thoughtEvents[0]?.createdAt ?? null, now);
        });

        if (eventCandidates.length > 0) {
          try {
            await tx.thoughtEvent.createMany({
              data: eventCandidates.map(({ thought, scoreResult }) => ({
                thoughtId: thought.id,
                eventType: ThoughtEventType.RESURFACED,
                metadata: {
                  score: scoreResult.score,
                  reason: scoreResult.reason,
                  source: eventSource,
                },
              })),
            });
          } catch (error: unknown) {
            if (!isForeignKeyConstraintError(error)) {
              throw error;
            }

            for (const candidate of eventCandidates) {
              try {
                await tx.thoughtEvent.create({
                  data: {
                    thoughtId: candidate.thought.id,
                    eventType: ThoughtEventType.RESURFACED,
                    metadata: {
                      score: candidate.scoreResult.score,
                      reason: candidate.scoreResult.reason,
                      source: eventSource,
                    },
                  },
                });
              } catch (singleError: unknown) {
                if (!isForeignKeyConstraintError(singleError)) {
                  throw singleError;
                }
              }
            }
          }
        }
      }

      return topCandidates.map(({ thought, scoreResult }) => ({
        ...thought,
        resurfacingScore: scoreResult.score,
        resurfacingReason: scoreResult.reason,
      }));
    });
  }
}

export const createResurfacingService = (
  dependencies: Partial<ResurfacingServiceDependencies> = {},
): ResurfacingService => {
  return new ResurfacingService({
    prismaClient: dependencies.prismaClient ?? prisma,
    nowProvider: dependencies.nowProvider ?? (() => new Date()),
  });
};
