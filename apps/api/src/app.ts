import express from "express";
import { ZodError } from "zod";

import { AppError } from "./errors/app-error";
import { createThoughtRoutes } from "./routes/thoughts";
import { checkDatabaseConnection } from "./services/prisma";
import { createThoughtService } from "./services/thought.service";

import type { ThoughtService } from "./services/thought.service";
import type { HealthResponse } from "@second-brain/shared";
import type { ErrorRequestHandler } from "express";

type AppDependencies = {
  thoughtService?: ThoughtService;
};

export const createApp = ({ thoughtService = createThoughtService() }: AppDependencies = {}) => {
  const app = express();

  app.use(
    express.json({
      limit: "32kb",
    }),
  );

  app.use("/thoughts", createThoughtRoutes({ thoughtService }));

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

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.flatten(),
        },
      });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error("Unhandled API error", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal Server Error",
      },
    });
  };

  app.use(errorHandler);

  return app;
};
