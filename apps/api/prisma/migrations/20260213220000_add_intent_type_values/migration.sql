-- Add new intent values required by AI Intent Engine.
ALTER TYPE "IntentType" ADD VALUE IF NOT EXISTS 'PROBLEM';
ALTER TYPE "IntentType" ADD VALUE IF NOT EXISTS 'GOAL';
