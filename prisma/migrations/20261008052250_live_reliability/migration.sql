-- AlterTable
ALTER TABLE "Source" ADD COLUMN "lastErrorKind" TEXT;
ALTER TABLE "Source" ADD COLUMN "lastVerification" TEXT;
ALTER TABLE "Source" ADD COLUMN "lastVerifiedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IngestionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "httpStatus" INTEGER,
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "itemsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "failureKind" TEXT,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IngestionRun" ("errorMessage", "errors", "finishedAt", "httpStatus", "id", "itemsDuplicate", "itemsFailed", "itemsFetched", "itemsNew", "sourceId", "startedAt", "status", "trigger") SELECT "errorMessage", "errors", "finishedAt", "httpStatus", "id", "itemsDuplicate", "itemsFailed", "itemsFetched", "itemsNew", "sourceId", "startedAt", "status", "trigger" FROM "IngestionRun";
DROP TABLE "IngestionRun";
ALTER TABLE "new_IngestionRun" RENAME TO "IngestionRun";
CREATE INDEX "IngestionRun_sourceId_startedAt_idx" ON "IngestionRun"("sourceId", "startedAt");
CREATE TABLE "new_SourceArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "titleHash" TEXT NOT NULL,
    "language" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "eventDate" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestionRunId" TEXT,
    "countryCodes" TEXT NOT NULL DEFAULT '[]',
    "diseaseSlugs" TEXT NOT NULL DEFAULT '[]',
    "locationText" TEXT,
    "geoPrecision" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceType" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "outbreakId" TEXT,
    "suggestedOutbreakId" TEXT,
    "duplicateOfId" TEXT,
    "raw" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'INGESTED',
    "primaryValidatedAt" DATETIME,
    CONSTRAINT "SourceArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SourceArticle_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SourceArticle_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SourceArticle" ("canonicalUrl", "countryCodes", "diseaseSlugs", "duplicateOfId", "eventDate", "externalId", "fetchedAt", "geoPrecision", "id", "ingestionRunId", "language", "locationText", "outbreakId", "publishedAt", "raw", "reviewStatus", "sourceId", "sourceType", "suggestedOutbreakId", "summary", "title", "titleHash", "url", "verificationStatus") SELECT "canonicalUrl", "countryCodes", "diseaseSlugs", "duplicateOfId", "eventDate", "externalId", "fetchedAt", "geoPrecision", "id", "ingestionRunId", "language", "locationText", "outbreakId", "publishedAt", "raw", "reviewStatus", "sourceId", "sourceType", "suggestedOutbreakId", "summary", "title", "titleHash", "url", "verificationStatus" FROM "SourceArticle";
DROP TABLE "SourceArticle";
ALTER TABLE "new_SourceArticle" RENAME TO "SourceArticle";
CREATE UNIQUE INDEX "SourceArticle_canonicalUrl_key" ON "SourceArticle"("canonicalUrl");
CREATE INDEX "SourceArticle_titleHash_idx" ON "SourceArticle"("titleHash");
CREATE INDEX "SourceArticle_publishedAt_idx" ON "SourceArticle"("publishedAt");
CREATE INDEX "SourceArticle_reviewStatus_idx" ON "SourceArticle"("reviewStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
