-- AlterTable
ALTER TABLE "OutbreakUpdate" ADD COLUMN "category" TEXT;

-- CreateTable
CREATE TABLE "TrackedEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outbreakId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "originCountryCode" TEXT NOT NULL,
    "originAdmin1" TEXT,
    "anchorTerms" TEXT NOT NULL,
    "contextTerms" TEXT NOT NULL,
    "weakAnchorTerms" TEXT NOT NULL DEFAULT '[]',
    "mapCenterLat" REAL NOT NULL,
    "mapCenterLng" REAL NOT NULL,
    "mapZoom" REAL NOT NULL DEFAULT 8,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrackedEvent_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OutbreakLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outbreakId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "admin1" TEXT,
    "countryCode" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "precision" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "notes" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "evidence" TEXT,
    "verifiedAt" DATETIME,
    "firstReportedAt" DATETIME NOT NULL,
    "sourceArticleId" TEXT,
    CONSTRAINT "OutbreakLocation_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutbreakLocation_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OutbreakLocation" ("admin1", "countryCode", "firstReportedAt", "id", "lat", "lng", "name", "notes", "outbreakId", "precision", "role", "sourceArticleId") SELECT "admin1", "countryCode", "firstReportedAt", "id", "lat", "lng", "name", "notes", "outbreakId", "precision", "role", "sourceArticleId" FROM "OutbreakLocation";
DROP TABLE "OutbreakLocation";
ALTER TABLE "new_OutbreakLocation" RENAME TO "OutbreakLocation";
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
    "trackedEventId" TEXT,
    "trackedLevel" TEXT,
    "trackedScore" INTEGER,
    "trackedTopics" TEXT NOT NULL DEFAULT '[]',
    "trackedReasons" TEXT,
    "materialChange" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SourceArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SourceArticle_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SourceArticle_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SourceArticle_trackedEventId_fkey" FOREIGN KEY ("trackedEventId") REFERENCES "TrackedEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SourceArticle" ("canonicalUrl", "classifierVersion", "contentType", "countryCodes", "diseaseSlugs", "duplicateOfId", "eventDate", "externalId", "fetchedAt", "geoPrecision", "id", "ingestionRunId", "language", "locationText", "mentionedCountryCodes", "origin", "outbreakId", "outbreakRelevant", "primaryValidatedAt", "publishedAt", "raw", "reviewStatus", "sourceId", "sourceType", "suggestedOutbreakId", "summary", "title", "titleHash", "url", "verificationStatus") SELECT "canonicalUrl", "classifierVersion", "contentType", "countryCodes", "diseaseSlugs", "duplicateOfId", "eventDate", "externalId", "fetchedAt", "geoPrecision", "id", "ingestionRunId", "language", "locationText", "mentionedCountryCodes", "origin", "outbreakId", "outbreakRelevant", "primaryValidatedAt", "publishedAt", "raw", "reviewStatus", "sourceId", "sourceType", "suggestedOutbreakId", "summary", "title", "titleHash", "url", "verificationStatus" FROM "SourceArticle";
DROP TABLE "SourceArticle";
ALTER TABLE "new_SourceArticle" RENAME TO "SourceArticle";
CREATE UNIQUE INDEX "SourceArticle_canonicalUrl_key" ON "SourceArticle"("canonicalUrl");
CREATE INDEX "SourceArticle_trackedEventId_publishedAt_idx" ON "SourceArticle"("trackedEventId", "publishedAt");
CREATE INDEX "SourceArticle_titleHash_idx" ON "SourceArticle"("titleHash");
CREATE INDEX "SourceArticle_publishedAt_idx" ON "SourceArticle"("publishedAt");
CREATE INDEX "SourceArticle_reviewStatus_idx" ON "SourceArticle"("reviewStatus");
CREATE UNIQUE INDEX "SourceArticle_sourceId_externalId_key" ON "SourceArticle"("sourceId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TrackedEvent_outbreakId_key" ON "TrackedEvent"("outbreakId");


-- Data: make the existing Irkutsk investigation the primary tracked event (only if that record exists and no tracked
-- event exists yet). Articles an analyst already linked to it are, by definition, about it. Nothing is deleted.
INSERT INTO "TrackedEvent" ("id", "outbreakId", "name", "primary", "active", "originCountryCode", "originAdmin1", "anchorTerms", "contextTerms", "weakAnchorTerms", "mapCenterLat", "mapCenterLng", "mapZoom", "createdAt", "updatedAt")
SELECT 'trk_russia_irkutsk_2026', "id", 'Irkutsk investigation', true, true, 'RU', 'Irkutsk Oblast',
  '["irkutsk", "shelekhov", "shelikhov", "shelehov", "anti-plague research institute", "anti-plague institute", "иркутск", "шелехов", "противочумн"]',
  '["plague", "yersinia", "pneumonia", "pathogen", "infection", "infectious", "epidemiolog", "quarantine", "quarantined", "contacts", "under observation", "laboratory", "lab worker", "technician", "researcher", "rospotrebnadzor", "outbreak", "virus", "bacteri", "tested", "test results", "unknown origin", "чум", "пневмони", "карантин", "роспотребнадзор", "инфекц"]',
  '["siberia", "siberian", "сибир"]',
  52.25, 104.2, 8.6, strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM "Outbreak" WHERE "slug" = 'russia-irkutsk-2026' AND NOT EXISTS (SELECT 1 FROM "TrackedEvent");

UPDATE "SourceArticle" SET "trackedEventId" = 'trk_russia_irkutsk_2026', "trackedLevel" = 'DIRECT'
WHERE "trackedEventId" IS NULL AND EXISTS (SELECT 1 FROM "TrackedEvent" WHERE "id" = 'trk_russia_irkutsk_2026')
  AND "outbreakId" = (SELECT "outbreakId" FROM "TrackedEvent" WHERE "id" = 'trk_russia_irkutsk_2026');
