import OpenAI from "openai";
import { z } from "zod";

import { DependencyError, ValidationError } from "../errors/app-error";

const CLASSIFICATION_MODEL = "gpt-5.2";
const CLASSIFICATION_TEMPERATURE = 0.2;

const SYSTEM_PROMPT = [
  "You are an AI classification engine. Return ONLY valid JSON. No explanation. No markdown.",
  "Classify the user thought into the provided schema.",
  "Use null for category, emotionalTone, or suggestedReminderDate when unknown or not applicable.",
  "suggestedReminderDate must be an ISO 8601 timestamp with timezone when present.",
  "cleanedText must preserve meaning while removing noise and ambiguity.",
].join(" ");

const thoughtClassificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intentType",
    "category",
    "emotionalTone",
    "urgencyLevel",
    "energyRequired",
    "suggestedReminderDate",
    "cleanedText",
  ],
  properties: {
    intentType: {
      type: "string",
      enum: ["IDEA", "TASK", "PROBLEM", "GOAL", "REMINDER", "REFLECTION"],
    },
    category: {
      type: ["string", "null"],
    },
    emotionalTone: {
      type: ["string", "null"],
    },
    urgencyLevel: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
    energyRequired: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH", "DEEP_WORK"],
    },
    suggestedReminderDate: {
      type: ["string", "null"],
      description: "ISO 8601 datetime with timezone, e.g. 2026-02-13T21:00:00Z",
    },
    cleanedText: {
      type: "string",
    },
  },
} as const;

export const ThoughtClassificationSchema = z.object({
  intentType: z.enum(["IDEA", "TASK", "PROBLEM", "GOAL", "REMINDER", "REFLECTION"]),
  category: z.string().trim().min(1).max(120).nullable(),
  emotionalTone: z.string().trim().min(1).max(80).nullable(),
  urgencyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  energyRequired: z.enum(["LOW", "MEDIUM", "HIGH", "DEEP_WORK"]),
  suggestedReminderDate: z.string().datetime({ offset: true }).nullable(),
  cleanedText: z.string().trim().min(1).max(4000),
});

export type ThoughtClassification = z.infer<typeof ThoughtClassificationSchema>;

export type ClassifyThoughtResult = {
  classification: ThoughtClassification;
  prompt: string;
  response: string;
  model: string;
};

export type AIService = {
  classifyThought(rawText: string): Promise<ClassifyThoughtResult>;
};

type AIServiceOptions = {
  client?: OpenAI;
  model?: string;
};

let defaultOpenAIClient: OpenAI | undefined;

const getDefaultOpenAIClient = (): OpenAI => {
  if (defaultOpenAIClient) {
    return defaultOpenAIClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new DependencyError("OPENAI_API_KEY is required", "OPENAI_API_KEY_MISSING");
  }

  defaultOpenAIClient = new OpenAI({ apiKey });
  return defaultOpenAIClient;
};

const getCompletionResponse = async (
  rawText: string,
  client: OpenAI,
  model: string,
): Promise<{ prompt: string; response: string; model: string }> => {
  const trimmedText = rawText.trim();
  if (!trimmedText) {
    throw new ValidationError("rawText must not be empty", "RAW_TEXT_EMPTY");
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: trimmedText,
    },
  ];

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: CLASSIFICATION_TEMPERATURE,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "thought_classification",
          strict: true,
          schema: thoughtClassificationJsonSchema,
        },
      },
    });

    const firstChoice = completion.choices[0];
    if (!firstChoice) {
      throw new DependencyError("OpenAI returned no choices", "OPENAI_EMPTY_CHOICES");
    }

    const refusal = firstChoice.message.refusal;
    if (refusal) {
      throw new DependencyError(`OpenAI refusal: ${refusal}`, "OPENAI_REFUSAL");
    }

    const response = firstChoice.message.content?.trim();
    if (!response) {
      throw new DependencyError("OpenAI returned empty response", "OPENAI_EMPTY_RESPONSE");
    }

    return {
      prompt: JSON.stringify(messages),
      response,
      model,
    };
  } catch (error: unknown) {
    if (error instanceof ValidationError || error instanceof DependencyError) {
      throw error;
    }

    throw new DependencyError("Failed to classify thought with OpenAI", "OPENAI_REQUEST_FAILED");
  }
};

const parseAndValidateClassification = (response: string): ThoughtClassification => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(response);
  } catch {
    throw new ValidationError("OpenAI response is not valid JSON", "OPENAI_INVALID_JSON");
  }

  return ThoughtClassificationSchema.parse(parsed);
};

const createClassifier = ({ client, model }: AIServiceOptions = {}): AIService => {
  const resolvedModel = model ?? CLASSIFICATION_MODEL;

  return {
    classifyThought: async (rawText: string): Promise<ClassifyThoughtResult> => {
      const resolvedClient = client ?? getDefaultOpenAIClient();
      const completion = await getCompletionResponse(rawText, resolvedClient, resolvedModel);
      const classification = parseAndValidateClassification(completion.response);

      return {
        classification,
        prompt: completion.prompt,
        response: completion.response,
        model: completion.model,
      };
    },
  };
};

export const createAIService = (options?: AIServiceOptions): AIService => createClassifier(options);

export const classifyThought = async (rawText: string): Promise<ClassifyThoughtResult> =>
  createClassifier().classifyThought(rawText);
