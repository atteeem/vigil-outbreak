-- AlterTable
ALTER TABLE "Source" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "Source" ADD COLUMN "leaseUntil" DATETIME;
ALTER TABLE "Source" ADD COLUMN "nextAttemptAt" DATETIME;

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "host" TEXT,
    "pid" INTEGER,
    "startedAt" DATETIME NOT NULL,
    "lastTickAt" DATETIME NOT NULL,
    "lastTickStatus" TEXT,
    "ticks" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceArticle_sourceId_externalId_key" ON "SourceArticle"("sourceId", "externalId");

