import { Prisma, ThoughtEventType } from "@prisma/client";

import { createNotificationService } from "../services/notification.service";
import { prisma } from "../services/prisma";
import { RESURFACING_WEIGHTS, createResurfacingService } from "../services/resurfacing.service";

import type { PushDeliverySummary } from "../services/notification.service";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const isRecentlyResurfaced = (lastResurfacedAt: Date | null, now: Date): boolean => {
  if (!lastResurfacedAt) {
    return false;
  }

  const maxAgeMs = RESURFACING_WEIGHTS.RECENT_RESURFACED_WINDOW_DAYS * DAY_IN_MS;
  return now.getTime() - lastResurfacedAt.getTime() <= maxAgeMs;
};

const isForeignKeyConstraintError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

type ResurfacingEventCandidate = {
  id: string;
  resurfacingScore: number;
  resurfacingReason: string;
};

const createResurfacedEventsResilient = async (
  candidates: ResurfacingEventCandidate[],
): Promise<number> => {
  if (candidates.length === 0) {
    return 0;
  }

  try {
    const created = await prisma.thoughtEvent.createMany({
      data: candidates.map((candidate) => ({
        thoughtId: candidate.id,
        eventType: ThoughtEventType.RESURFACED,
        metadata: {
          score: candidate.resurfacingScore,
          reason: candidate.resurfacingReason,
          source: "daily_resurfacing_job",
        },
      })),
    });

    return created.count;
  } catch (error: unknown) {
    if (!isForeignKeyConstraintError(error)) {
      throw error;
    }

    // Concurrent deletes can invalidate a subset of candidates.
    // Retry row-by-row so valid thoughts still get events.
    let createdCount = 0;
    for (const candidate of candidates) {
      try {
        await prisma.thoughtEvent.create({
          data: {
            thoughtId: candidate.id,
            eventType: ThoughtEventType.RESURFACED,
            metadata: {
              score: candidate.resurfacingScore,
              reason: candidate.resurfacingReason,
              source: "daily_resurfacing_job",
            },
          },
        });
        createdCount += 1;
      } catch (singleError: unknown) {
        if (!isForeignKeyConstraintError(singleError)) {
          throw singleError;
        }
      }
    }

    return createdCount;
  }
};

export type ProcessResurfacingJobResult = {
  totalUsers: number;
  processedUsers: number;
  totalCandidates: number;
  eventsCreated: number;
  skippedRecentlyResurfaced: number;
  notificationsAttempted: number;
  notificationsDelivered: number;
  notificationsFailed: number;
  completedAt: string;
};

type ProcessResurfacingJobDependencies = {
  notificationService: {
    sendPushToUser: (userId: string, title: string, body: string) => Promise<PushDeliverySummary>;
  };
};

const buildResurfacingBody = (candidateTexts: string[]): string => {
  if (candidateTexts.length === 0) {
    return "Your top thoughts are ready to review.";
  }

  const first = candidateTexts[0]?.trim().replace(/\s+/g, " ") ?? "A thought is ready";
  const truncatedFirst = first.length > 120 ? `${first.slice(0, 117)}...` : first;

  if (candidateTexts.length === 1) {
    return truncatedFirst;
  }

  return `${truncatedFirst} (+${candidateTexts.length - 1} more)`;
};

export const processResurfacingJob = async (
  dependencies: Partial<ProcessResurfacingJobDependencies> = {},
): Promise<ProcessResurfacingJobResult> => {
  const notificationService = dependencies.notificationService ?? createNotificationService();
  const now = new Date();
  const users = await prisma.user.findMany({
    select: {
      id: true,
    },
  });

  const resurfacingService = createResurfacingService({
    prismaClient: prisma,
    nowProvider: () => now,
  });

  let totalCandidates = 0;
  let eventsCreated = 0;
  let skippedRecentlyResurfaced = 0;
  let notificationsAttempted = 0;
  let notificationsDelivered = 0;
  let notificationsFailed = 0;

  for (const user of users) {
    const candidates = await resurfacingService.getTopResurfacingCandidates(user.id, 3, {
      emitEvents: false,
    });

    totalCandidates += candidates.length;

    const eligibleCandidates = candidates.filter((candidate) => {
      const lastResurfacedAt = candidate.thoughtEvents[0]?.createdAt ?? null;
      return !isRecentlyResurfaced(lastResurfacedAt, now);
    });

    skippedRecentlyResurfaced += candidates.length - eligibleCandidates.length;

    if (eligibleCandidates.length === 0) {
      console.log("Daily resurfacing user processed", {
        userId: user.id,
        candidateCount: candidates.length,
        createdEvents: 0,
        skippedRecent: candidates.length,
      });
      continue;
    }

    const createdCount = await createResurfacedEventsResilient(
      eligibleCandidates.map((candidate) => ({
        id: candidate.id,
        resurfacingScore: candidate.resurfacingScore,
        resurfacingReason: candidate.resurfacingReason,
      })),
    );

    eventsCreated += createdCount;

    const candidateTexts = eligibleCandidates.map(
      (candidate) => candidate.cleanedText ?? candidate.originalText,
    );

    try {
      const notification = await notificationService.sendPushToUser(
        user.id,
        "BrainDumb Resurfacing",
        buildResurfacingBody(candidateTexts),
      );

      notificationsAttempted += notification.attempted;
      notificationsDelivered += notification.delivered;
      notificationsFailed += notification.failed;

      if (notification.failed > 0) {
        console.error("Resurfacing push delivery had failures", {
          userId: user.id,
          failed: notification.failed,
          attempted: notification.attempted,
        });
      }
    } catch (error: unknown) {
      console.error("Resurfacing push delivery failed", {
        userId: user.id,
        error,
      });
    }

    console.log("Daily resurfacing user processed", {
      userId: user.id,
      candidateCount: candidates.length,
      createdEvents: createdCount,
      skippedRecent: candidates.length - eligibleCandidates.length,
    });
  }

  return {
    totalUsers: users.length,
    processedUsers: users.length,
    totalCandidates,
    eventsCreated,
    skippedRecentlyResurfaced,
    notificationsAttempted,
    notificationsDelivered,
    notificationsFailed,
    completedAt: now.toISOString(),
  };
};
