-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IntentType" AS ENUM ('TASK', 'IDEA', 'NOTE', 'QUESTION', 'REFLECTION', 'REMINDER', 'PROJECT', 'OTHER');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ThoughtStatus" AS ENUM ('CAPTURED', 'PLANNED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnergyRequired" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'DEEP_WORK');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ThoughtEventType" AS ENUM ('CREATED', 'UPDATED', 'REMINDER_SENT', 'COMPLETED', 'RESURFACED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thoughts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalText" TEXT NOT NULL,
    "cleanedText" TEXT,
    "intentType" "IntentType" NOT NULL,
    "category" VARCHAR(120),
    "emotionalTone" VARCHAR(80),
    "urgencyLevel" "UrgencyLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "ThoughtStatus" NOT NULL DEFAULT 'CAPTURED',
    "energyRequired" "EnergyRequired" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "thoughts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "thoughtId" UUID NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_plans" (
    "id" UUID NOT NULL,
    "thoughtId" UUID NOT NULL,
    "planJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "execution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thought_events" (
    "id" UUID NOT NULL,
    "thoughtId" UUID NOT NULL,
    "eventType" "ThoughtEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thought_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resurfacing_signals" (
    "id" UUID NOT NULL,
    "thoughtId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "lastEvaluatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resurfacing_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_logs" (
    "id" UUID NOT NULL,
    "thoughtId" UUID,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_thought_user_id" ON "thoughts"("userId");

-- CreateIndex
CREATE INDEX "idx_thought_status" ON "thoughts"("status");

-- CreateIndex
CREATE INDEX "idx_thought_created_at" ON "thoughts"("createdAt");

-- CreateIndex
CREATE INDEX "idx_reminder_thought_id" ON "reminders"("thoughtId");

-- CreateIndex
CREATE INDEX "idx_reminder_scheduled_for" ON "reminders"("scheduledFor");

-- CreateIndex
CREATE INDEX "idx_reminder_status" ON "reminders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "execution_plans_thoughtId_key" ON "execution_plans"("thoughtId");

-- CreateIndex
CREATE INDEX "idx_thought_event_thought_id" ON "thought_events"("thoughtId");

-- CreateIndex
CREATE INDEX "idx_thought_event_type" ON "thought_events"("eventType");

-- CreateIndex
CREATE INDEX "idx_resurfacing_signal_thought_id" ON "resurfacing_signals"("thoughtId");

-- CreateIndex
CREATE INDEX "idx_ai_log_thought_id" ON "ai_logs"("thoughtId");

-- AddForeignKey
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "thoughts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_plans" ADD CONSTRAINT "execution_plans_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "thoughts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thought_events" ADD CONSTRAINT "thought_events_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "thoughts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resurfacing_signals" ADD CONSTRAINT "resurfacing_signals_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "thoughts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "thoughts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

