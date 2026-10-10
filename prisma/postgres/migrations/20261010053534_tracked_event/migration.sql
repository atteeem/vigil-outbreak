-- AlterTable
ALTER TABLE "OutbreakLocation" ADD COLUMN     "evidence" TEXT,
ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OutbreakUpdate" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "SourceArticle" ADD COLUMN     "materialChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trackedEventId" TEXT,
ADD COLUMN     "trackedLevel" TEXT,
ADD COLUMN     "trackedReasons" TEXT,
ADD COLUMN     "trackedScore" INTEGER,
ADD COLUMN     "trackedTopics" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "TrackedEvent" (
    "id" TEXT NOT NULL,
    "outbreakId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "originCountryCode" TEXT NOT NULL,
    "originAdmin1" TEXT,
    "anchorTerms" TEXT NOT NULL,
    "contextTerms" TEXT NOT NULL,
    "weakAnchorTerms" TEXT NOT NULL DEFAULT '[]',
    "mapCenterLat" DOUBLE PRECISION NOT NULL,
    "mapCenterLng" DOUBLE PRECISION NOT NULL,
    "mapZoom" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedEvent_outbreakId_key" ON "TrackedEvent"("outbreakId");

-- CreateIndex
CREATE INDEX "SourceArticle_trackedEventId_publishedAt_idx" ON "SourceArticle"("trackedEventId", "publishedAt");

-- AddForeignKey
ALTER TABLE "TrackedEvent" ADD CONSTRAINT "TrackedEvent_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceArticle" ADD CONSTRAINT "SourceArticle_trackedEventId_fkey" FOREIGN KEY ("trackedEventId") REFERENCES "TrackedEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: make the existing Irkutsk investigation the primary tracked event (see the SQLite migration).
INSERT INTO "TrackedEvent" ("id", "outbreakId", "name", "primary", "active", "originCountryCode", "originAdmin1", "anchorTerms", "contextTerms", "weakAnchorTerms", "mapCenterLat", "mapCenterLng", "mapZoom", "createdAt", "updatedAt")
SELECT 'trk_russia_irkutsk_2026', "id", 'Irkutsk investigation', true, true, 'RU', 'Irkutsk Oblast',
  '["irkutsk", "shelekhov", "shelikhov", "shelehov", "anti-plague research institute", "anti-plague institute", "иркутск", "шелехов", "противочумн"]',
  '["plague", "yersinia", "pneumonia", "pathogen", "infection", "infectious", "epidemiolog", "quarantine", "quarantined", "contacts", "under observation", "laboratory", "lab worker", "technician", "researcher", "rospotrebnadzor", "outbreak", "virus", "bacteri", "tested", "test results", "unknown origin", "чум", "пневмони", "карантин", "роспотребнадзор", "инфекц"]',
  '["siberia", "siberian", "сибир"]',
  52.25, 104.2, 8.6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Outbreak" WHERE "slug" = 'russia-irkutsk-2026' AND NOT EXISTS (SELECT 1 FROM "TrackedEvent");

UPDATE "SourceArticle" SET "trackedEventId" = 'trk_russia_irkutsk_2026', "trackedLevel" = 'DIRECT'
WHERE "trackedEventId" IS NULL AND EXISTS (SELECT 1 FROM "TrackedEvent" WHERE "id" = 'trk_russia_irkutsk_2026')
  AND "outbreakId" = (SELECT "outbreakId" FROM "TrackedEvent" WHERE "id" = 'trk_russia_irkutsk_2026');
