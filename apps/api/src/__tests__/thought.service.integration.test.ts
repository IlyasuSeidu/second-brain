import { createAIService } from "../services/ai";
import { createThoughtService } from "../services/thought.service";

import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

describe("ThoughtService.captureThought", () => {
  it("creates thought, event, reminder, and ai log atomically", async () => {
    const thoughtId = "a153908f-f353-4a00-abbe-dfcf14c8f3c8";
    const userId = "56f8f635-9d4b-4a81-8f80-b17966f6aef7";
    const now = new Date("2026-02-13T21:00:00.000Z");
    const reminderDate = new Date("2026-02-14T10:00:00.000Z");

    const thoughtRecord = {
      id: thoughtId,
      userId,
      originalText: "Need to prepare investor update tomorrow morning",
      cleanedText: "Prepare investor update by tomorrow morning",
      intentType: "TASK",
      category: "Work",
      emotionalTone: "Focused",
      urgencyLevel: "HIGH",
      status: "CAPTURED",
      energyRequired: "DEEP_WORK",
      createdAt: now,
      updatedAt: now,
    } as const;

    const reminderRecord = {
      id: "3f5935fb-1d56-4814-b932-3888aad8ee3f",
      thoughtId,
      scheduledFor: reminderDate,
      sentAt: null,
      status: "PENDING",
      createdAt: now,
    } as const;

    const thoughtWithReminder = {
      ...thoughtRecord,
      reminders: [reminderRecord],
    };

    const openAICompletionCreate = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intentType: "TASK",
              category: "Work",
              emotionalTone: "Focused",
              urgencyLevel: "HIGH",
              energyRequired: "DEEP_WORK",
              suggestedReminderDate: "2026-02-14T10:00:00Z",
              cleanedText: "Prepare investor update by tomorrow morning",
            }),
            refusal: null,
          },
        },
      ],
    });

    const openAIClient = {
      chat: {
        completions: {
          create: openAICompletionCreate,
        },
      },
    } as unknown as OpenAI;

    const aiService = createAIService({ client: openAIClient });

    const tx = {
      thought: {
        create: jest.fn().mockResolvedValue(thoughtRecord),
        findUniqueOrThrow: jest.fn().mockResolvedValue(thoughtWithReminder),
      },
      thoughtEvent: {
        create: jest.fn().mockResolvedValue({
          id: "7e7b53f2-2ac1-45a0-b343-7c6aaef971ef",
          thoughtId,
          eventType: "CREATED",
          metadata: { source: "ai_intent_engine" },
          createdAt: now,
        }),
      },
      reminder: {
        create: jest.fn().mockResolvedValue(reminderRecord),
      },
      aiLog: {
        create: jest.fn().mockResolvedValue({
          id: "a6e7f2c8-03dd-4de0-b889-ff72b5d4ab6c",
          thoughtId,
          prompt: "prompt",
          response: "response",
          model: "gpt-5.2",
          createdAt: now,
        }),
      },
    };

    const prismaClient = {
      $transaction: jest.fn(
        async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => {
          return callback(tx as unknown as Prisma.TransactionClient);
        },
      ),
    };

    const service = createThoughtService({
      aiService,
      prismaClient,
    });

    const result = await service.captureThought(userId, thoughtRecord.originalText);

    expect(openAICompletionCreate).toHaveBeenCalledTimes(1);

    expect(tx.thought.create).toHaveBeenCalledWith({
      data: {
        userId,
        originalText: thoughtRecord.originalText,
        cleanedText: thoughtRecord.cleanedText,
        intentType: "TASK",
        category: "Work",
        emotionalTone: "Focused",
        urgencyLevel: "HIGH",
        energyRequired: "DEEP_WORK",
        status: "CAPTURED",
      },
    });

    expect(tx.thoughtEvent.create).toHaveBeenCalledWith({
      data: {
        thoughtId,
        eventType: "CREATED",
        metadata: {
          source: "ai_intent_engine",
        },
      },
    });

    expect(tx.reminder.create).toHaveBeenCalledWith({
      data: {
        thoughtId,
        scheduledFor: reminderDate,
        status: "PENDING",
      },
    });

    expect(tx.aiLog.create).toHaveBeenCalledTimes(1);
    expect(tx.aiLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        thoughtId,
        model: "gpt-5.2",
      }),
    });

    expect(result).toEqual(thoughtWithReminder);
    expect(prismaClient.$transaction).toHaveBeenCalledTimes(1);
  });
});
