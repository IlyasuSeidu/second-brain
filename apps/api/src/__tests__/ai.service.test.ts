import { createAIService } from "../services/ai";

import type OpenAI from "openai";

describe("AI service classifyThought", () => {
  it("returns validated classification from strict JSON", async () => {
    const openAICompletionCreate = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intentType: "IDEA",
              category: "Product",
              emotionalTone: "Curious",
              urgencyLevel: "MEDIUM",
              energyRequired: "HIGH",
              suggestedReminderDate: null,
              cleanedText: "Explore AI-powered backlog triage",
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

    const service = createAIService({ client: openAIClient });

    const result = await service.classifyThought("Explore AI-powered backlog triage");

    expect(openAICompletionCreate).toHaveBeenCalledTimes(1);
    expect(result.classification.intentType).toBe("IDEA");
    expect(result.classification.cleanedText).toBe("Explore AI-powered backlog triage");
  });

  it("throws when OpenAI returns non-JSON", async () => {
    const openAICompletionCreate = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "not-json",
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

    const service = createAIService({ client: openAIClient });

    await expect(service.classifyThought("Need to set reminder tomorrow")).rejects.toThrow(
      "OpenAI response is not valid JSON",
    );
  });
});
