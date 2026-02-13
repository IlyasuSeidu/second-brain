import request from "supertest";

import { createApp } from "../app";

import type { ThoughtService } from "../services/thought.service";

describe("POST /thoughts/capture", () => {
  it("captures a thought and returns structured output", async () => {
    const thoughtService = {
      captureThought: jest.fn().mockResolvedValue({
        id: "8ff8f614-13fc-42f5-8e0f-c671b58ec38c",
        userId: "1efbcb18-ddb7-435f-a12f-8f0ae5c2697a",
        originalText: "Set reminder for quarterly planning",
        cleanedText: "Set reminder for quarterly planning",
        intentType: "REMINDER",
        category: "Planning",
        emotionalTone: null,
        urgencyLevel: "MEDIUM",
        status: "CAPTURED",
        energyRequired: "LOW",
        createdAt: new Date("2026-02-13T20:00:00.000Z"),
        updatedAt: new Date("2026-02-13T20:00:00.000Z"),
        reminders: [],
      }),
    };

    const app = createApp({ thoughtService: thoughtService as unknown as ThoughtService });

    const response = await request(app).post("/thoughts/capture").send({
      userId: "1efbcb18-ddb7-435f-a12f-8f0ae5c2697a",
      rawText: "Set reminder for quarterly planning",
    });

    expect(response.status).toBe(201);
    expect(response.body.thought.intentType).toBe("REMINDER");
    expect(thoughtService.captureThought).toHaveBeenCalledWith(
      "1efbcb18-ddb7-435f-a12f-8f0ae5c2697a",
      "Set reminder for quarterly planning",
    );
  });
});
