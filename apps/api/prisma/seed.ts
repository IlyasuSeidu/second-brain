import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL ?? "dev@braindumb.local";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  console.log(`Seeded development user: ${user.email} (${user.id})`);
}

main()
  .catch((error: unknown) => {
    console.error("Prisma seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
