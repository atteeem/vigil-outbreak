-- CreateTable
CREATE TABLE "Disease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pathogen" TEXT,
    "pathogenType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT
);

-- CreateTable
CREATE TABLE "Outbreak" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diseaseId" TEXT,
    "suspectedDiseaseId" TEXT,
    "classification" TEXT NOT NULL,
    "pathogenStatus" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "firstReportedAt" DATETIME NOT NULL,
    "eventStartDate" DATETIME,
    "lastVerifiedAt" DATETIME,
    "resolvedAt" DATETIME,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Outbreak_diseaseId_fkey" FOREIGN KEY ("diseaseId") REFERENCES "Disease" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Outbreak_suspectedDiseaseId_fkey" FOREIGN KEY ("suspectedDiseaseId") REFERENCES "Disease" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Outbreak_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Outbreak" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutbreakLocation" (
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
    "firstReportedAt" DATETIME NOT NULL,
    "sourceArticleId" TEXT,
    CONSTRAINT "OutbreakLocation_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutbreakLocation_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutbreakObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outbreakId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER,
    "valueHigh" INTEGER,
    "isCumulative" BOOLEAN NOT NULL DEFAULT true,
    "deathCauseConfirmed" BOOLEAN,
    "scope" TEXT,
    "asOfDate" DATETIME,
    "reportedAt" DATETIME NOT NULL,
    "sourceType" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "attributedTo" TEXT,
    "notes" TEXT,
    "sourceArticleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutbreakObservation_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutbreakObservation_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutbreakUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outbreakId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" DATETIME,
    "publishedAt" DATETIME NOT NULL,
    "sourceType" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "attributedTo" TEXT,
    "sourceArticleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutbreakUpdate_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutbreakUpdate_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outbreakId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "sourceArticleId" TEXT,
    CONSTRAINT "RiskAssessment_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskAssessment_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "url" TEXT,
    "homepage" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastFetchAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "endpointStatus" TEXT NOT NULL DEFAULT 'UNTESTED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SourceArticle" (
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
    CONSTRAINT "SourceArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SourceArticle_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SourceArticle_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT,
    "outbreakId" TEXT,
    "claimType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "metric" TEXT,
    "value" INTEGER,
    "attributedTo" TEXT,
    "sourceType" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "conflictNote" TEXT,
    "conflictsWithId" TEXT,
    "extractedBy" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceClaim_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "SourceArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceClaim_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestigationStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outbreakId" TEXT NOT NULL,
    "fromClassification" TEXT,
    "toClassification" TEXT NOT NULL,
    "fromPathogenStatus" TEXT,
    "toPathogenStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" DATETIME NOT NULL,
    "actor" TEXT NOT NULL,
    "sourceArticleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestigationStatusHistory_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestigationStatusHistory_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestionRun" (
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
    "errors" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT NOT NULL DEFAULT '{}',
    "actor" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Disease_slug_key" ON "Disease"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Outbreak_slug_key" ON "Outbreak"("slug");

-- CreateIndex
CREATE INDEX "Outbreak_published_classification_idx" ON "Outbreak"("published", "classification");

-- CreateIndex
CREATE INDEX "OutbreakObservation_outbreakId_metric_reportedAt_idx" ON "OutbreakObservation"("outbreakId", "metric", "reportedAt");

-- CreateIndex
CREATE INDEX "OutbreakUpdate_outbreakId_publishedAt_idx" ON "OutbreakUpdate"("outbreakId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SourceArticle_canonicalUrl_key" ON "SourceArticle"("canonicalUrl");

-- CreateIndex
CREATE INDEX "SourceArticle_titleHash_idx" ON "SourceArticle"("titleHash");

-- CreateIndex
CREATE INDEX "SourceArticle_publishedAt_idx" ON "SourceArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "SourceArticle_reviewStatus_idx" ON "SourceArticle"("reviewStatus");

-- CreateIndex
CREATE INDEX "InvestigationStatusHistory_outbreakId_effectiveAt_idx" ON "InvestigationStatusHistory"("outbreakId", "effectiveAt");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_startedAt_idx" ON "IngestionRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
