import express from "express";

import { checkDatabaseConnection } from "./services/prisma";

import type { HealthResponse } from "@second-brain/shared";

export const createApp = () => {
  const app = express();

  app.get("/health", async (_req, res) => {
    const isDatabaseConnected = await checkDatabaseConnection();

    const payload: HealthResponse = {
      status: isDatabaseConnected ? "ok" : "error",
      service: "api",
      database: isDatabaseConnected ? "up" : "down",
      timestamp: new Date().toISOString(),
    };

    res.status(isDatabaseConnected ? 200 : 503).json(payload);
  });

  return app;
};
