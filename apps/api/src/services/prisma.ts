import { PrismaClient } from "@prisma/client";

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
};

const globalForPrisma = globalThis as PrismaGlobal;

const prismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

export const prisma = prismaClient;

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch (error: unknown) {
    console.error("Database connection health check failed", error);
    return false;
  }
};
