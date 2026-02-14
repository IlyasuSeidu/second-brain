import {
  EnergyRequired,
  IntentType,
  ThoughtEventType,
  ThoughtStatus,
  UrgencyLevel,
} from "@prisma/client";
import request from "supertest";

import { cleanupUser, createIntegrationUser, describeIfDatabase } from "./helpers/integration";

describeIfDatabase("GET /thoughts/resurface", () => {
  let userId: string;
  let secondaryUserId: string | undefined;

  beforeEach(async () => {
    const user = await createIntegrationUser();
    userId = user.id;
  });

  afterEach(async () => {
    await cleanupUser(userId);

    if (secondaryUserId) {
      await cleanupUser(secondaryUserId);
      secondaryUserId = undefined;
    }
  });

  it("returns top resurfacing candidates for a user", async () => {
    const { prisma } = await import("../services/prisma");
    const { createApp } = await import("../app");

    const highest = await prisma.thought.create({
      data: {
        userId,
        originalText: "Ship onboarding fix",
        cleanedText: "Ship onboarding fix",
        intentType: IntentType.TASK,
        urgencyLevel: UrgencyLevel.HIGH,
        status: ThoughtStatus.CAPTURED,
        energyRequired: EnergyRequired.HIGH,
        createdAt: new Date("2026-02-20T00:00:00.000Z"),
      },
    });

    const lower = await prisma.thought.create({
      data: {
        userId,
        originalText: "Organize notes",
        cleanedText: "Organize notes",
        intentType: IntentType.REFLECTION,
        urgencyLevel: UrgencyLevel.LOW,
        status: ThoughtStatus.CAPTURED,
        energyRequired: EnergyRequired.LOW,
        createdAt: new Date("2026-03-05T00:00:00.000Z"),
      },
    });

    const secondaryUser = await createIntegrationUser();
    secondaryUserId = secondaryUser.id;

    await prisma.thought.create({
      data: {
        userId: secondaryUserId,
        originalText: "Other user thought",
        cleanedText: "Other user thought",
        intentType: IntentType.TASK,
        urgencyLevel: UrgencyLevel.HIGH,
        status: ThoughtStatus.CAPTURED,
        energyRequired: EnergyRequired.HIGH,
      },
    });

    const app = createApp();

    const response = await request(app).get("/thoughts/resurface?limit=5").set("x-user-id", userId);

    expect(response.status).toBe(200);
    expect(response.body.candidates).toHaveLength(2);
    expect(response.body.candidates[0]?.id).toBe(highest.id);
    expect(response.body.candidates[1]?.id).toBe(lower.id);

    const resurfacedEvents = await prisma.thoughtEvent.findMany({
      where: {
        thoughtId: {
          in: [highest.id, lower.id],
        },
        eventType: ThoughtEventType.RESURFACED,
      },
    });

    const routeEvents = resurfacedEvents.filter((event) => {
      const metadata = event.metadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return false;
      }

      return (metadata as { source?: string }).source === "resurfacing_engine";
    });

    expect(routeEvents).toHaveLength(2);
  });

  it("rejects requests without user identifier", async () => {
    const { createApp } = await import("../app");

    const app = createApp();

    const response = await request(app).get("/thoughts/resurface?limit=5");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
