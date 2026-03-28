-- CreateEnum
CREATE TYPE "MigrationRunStatus" AS ENUM ('PENDING', 'COMPLETE', 'ROLLED_BACK');

-- AlterTable
ALTER TABLE "Mapping" ADD COLUMN     "stediGuideId" TEXT;

-- CreateTable
CREATE TABLE "MigrationRun" (
    "id" TEXT NOT NULL,
    "status" "MigrationRunStatus" NOT NULL DEFAULT 'PENDING',
    "report" JSONB NOT NULL,
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationRun_pkey" PRIMARY KEY ("id")
);
