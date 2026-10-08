-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "mentionedCountryCodes" TEXT NOT NULL DEFAULT '[]',
    "contentType" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "outbreakRelevant" BOOLEAN NOT NULL DEFAULT true,
    "classifierVersion" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_SourceArticle" ("canonicalUrl", "countryCodes", "diseaseSlugs", "duplicateOfId", "eventDate", "externalId", "fetchedAt", "geoPrecision", "id", "ingestionRunId", "language", "locationText", "origin", "outbreakId", "primaryValidatedAt", "publishedAt", "raw", "reviewStatus", "sourceId", "sourceType", "suggestedOutbreakId", "summary", "title", "titleHash", "url", "verificationStatus") SELECT "canonicalUrl", "countryCodes", "diseaseSlugs", "duplicateOfId", "eventDate", "externalId", "fetchedAt", "geoPrecision", "id", "ingestionRunId", "language", "locationText", "origin", "outbreakId", "primaryValidatedAt", "publishedAt", "raw", "reviewStatus", "sourceId", "sourceType", "suggestedOutbreakId", "summary", "title", "titleHash", "url", "verificationStatus" FROM "SourceArticle";
DROP TABLE "SourceArticle";
ALTER TABLE "new_SourceArticle" RENAME TO "SourceArticle";
CREATE UNIQUE INDEX "SourceArticle_canonicalUrl_key" ON "SourceArticle"("canonicalUrl");
CREATE INDEX "SourceArticle_titleHash_idx" ON "SourceArticle"("titleHash");
CREATE INDEX "SourceArticle_publishedAt_idx" ON "SourceArticle"("publishedAt");
CREATE INDEX "SourceArticle_reviewStatus_idx" ON "SourceArticle"("reviewStatus");
CREATE UNIQUE INDEX "SourceArticle_sourceId_externalId_key" ON "SourceArticle"("sourceId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

