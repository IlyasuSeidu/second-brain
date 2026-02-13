import { ReminderStatus, ThoughtEventType, ThoughtStatus } from "@prisma/client";
import { z } from "zod";

import { ValidationError } from "../errors/app-error";

import { createAIService, ThoughtClassificationSchema } from "./ai";
import { prisma } from "./prisma";

import type { AIService } from "./ai";
import type { Prisma } from "@prisma/client";

const captureThoughtInputSchema = z.object({
  userId: z.string().uuid(),
  rawText: z.string().trim().min(1).max(4000),
});

export type CapturedThought = Prisma.ThoughtGetPayload<{
  include: { reminders: true };
}>;

export type ThoughtServicePrisma = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

type ThoughtServiceDependencies = {
  aiService: AIService;
  prismaClient: ThoughtServicePrisma;
};

export class ThoughtService {
  private readonly aiService: AIService;
  private readonly prismaClient: ThoughtServicePrisma;

  constructor({ aiService, prismaClient }: ThoughtServiceDependencies) {
    this.aiService = aiService;
    this.prismaClient = prismaClient;
  }

  async captureThought(userId: string, rawText: string): Promise<CapturedThought> {
    const input = captureThoughtInputSchema.parse({ userId, rawText });

    const classificationResult = await this.aiService.classifyThought(input.rawText);
    const classification = ThoughtClassificationSchema.parse(classificationResult.classification);

    return this.prismaClient.$transaction(async (tx) => {
      const thought = await tx.thought.create({
        data: {
          userId: input.userId,
          originalText: input.rawText,
          cleanedText: classification.cleanedText,
          intentType: classification.intentType,
          category: classification.category,
          emotionalTone: classification.emotionalTone,
          urgencyLevel: classification.urgencyLevel,
          energyRequired: classification.energyRequired,
          status: ThoughtStatus.CAPTURED,
        },
      });

      await tx.thoughtEvent.create({
        data: {
          thoughtId: thought.id,
          eventType: ThoughtEventType.CREATED,
          metadata: {
            source: "ai_intent_engine",
          },
        },
      });

      if (classification.suggestedReminderDate) {
        const reminderDate = new Date(classification.suggestedReminderDate);
        if (Number.isNaN(reminderDate.getTime())) {
          throw new ValidationError(
            "AI produced an invalid reminder date",
            "INVALID_REMINDER_DATE",
          );
        }

        await tx.reminder.create({
          data: {
            thoughtId: thought.id,
            scheduledFor: reminderDate,
            status: ReminderStatus.PENDING,
          },
        });
      }

      await tx.aiLog.create({
        data: {
          thoughtId: thought.id,
          prompt: classificationResult.prompt,
          response: classificationResult.response,
          model: classificationResult.model,
        },
      });

      return tx.thought.findUniqueOrThrow({
        where: { id: thought.id },
        include: {
          reminders: {
            orderBy: { scheduledFor: "asc" },
          },
        },
      });
    });
  }
}

export const createThoughtService = (
  dependencies: Partial<ThoughtServiceDependencies> = {},
): ThoughtService => {
  return new ThoughtService({
    aiService: dependencies.aiService ?? createAIService(),
    prismaClient: dependencies.prismaClient ?? prisma,
  });
};
