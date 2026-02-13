import { Router } from "express";
import { z } from "zod";

import type { ThoughtService } from "../services/thought.service";

const captureThoughtBodySchema = z.object({
  userId: z.string().uuid(),
  rawText: z.string().trim().min(1).max(4000),
});

type ThoughtRoutesDependencies = {
  thoughtService: ThoughtService;
};

export const createThoughtRoutes = ({ thoughtService }: ThoughtRoutesDependencies): Router => {
  const router = Router();

  router.post("/capture", async (req, res, next) => {
    try {
      const body = captureThoughtBodySchema.parse(req.body);
      const thought = await thoughtService.captureThought(body.userId, body.rawText);

      res.status(201).json({ thought });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
};
