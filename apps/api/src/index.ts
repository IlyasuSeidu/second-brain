import "dotenv/config";

import { createApp } from "./app";
import { prisma } from "./services/prisma";

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

const server = app.listen(port, () => {
  // Keep logging concise for container logs and local development.
  console.log(`BrainDumb API listening on port ${port}`);
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
