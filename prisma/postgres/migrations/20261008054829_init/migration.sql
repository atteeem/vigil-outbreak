-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Disease" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pathogen" TEXT,
    "pathogenType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT,

    CONSTRAINT "Disease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbreak" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diseaseId" TEXT,
    "suspectedDiseaseId" TEXT,
    "classification" TEXT NOT NULL,
    "pathogenStatus" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "firstReportedAt" TIMESTAMP(3) NOT NULL,
    "eventStartDate" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outbreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutbreakLocation" (
    "id" TEXT NOT NULL,
    "outbreakId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "admin1" TEXT,
    "countryCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "precision" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "notes" TEXT,
    "firstReportedAt" TIMESTAMP(3) NOT NULL,
    "sourceArticleId" TEXT,

    CONSTRAINT "OutbreakLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutbreakObservation" (
    "id" TEXT NOT NULL,
    "outbreakId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER,
    "valueHigh" INTEGER,
    "isCumulative" BOOLEAN NOT NULL DEFAULT true,
    "deathCauseConfirmed" BOOLEAN,
    "scope" TEXT,
    "asOfDate" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "attributedTo" TEXT,
    "notes" TEXT,
    "sourceArticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutbreakObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutbreakUpdate" (
    "id" TEXT NOT NULL,
    "outbreakId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "attributedTo" TEXT,
    "sourceArticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutbreakUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "outbreakId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "sourceArticleId" TEXT,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "url" TEXT,
    "homepage" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastFetchAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "endpointStatus" TEXT NOT NULL DEFAULT 'UNTESTED',
    "lastErrorKind" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerification" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceArticle" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "titleHash" TEXT NOT NULL,
    "language" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "eventDate" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "primaryValidatedAt" TIMESTAMP(3),

    CONSTRAINT "SourceArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceClaim" (
    "id" TEXT NOT NULL,
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
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationStatusHistory" (
    "id" TEXT NOT NULL,
    "outbreakId" TEXT NOT NULL,
    "fromClassification" TEXT,
    "toClassification" TEXT NOT NULL,
    "fromPathogenStatus" TEXT,
    "toPathogenStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actor" TEXT NOT NULL,
    "sourceArticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestigationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "itemsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "failureKind" TEXT,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT NOT NULL DEFAULT '{}',
    "actor" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "host" TEXT,
    "pid" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastTickAt" TIMESTAMP(3) NOT NULL,
    "lastTickStatus" TEXT,
    "ticks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "SourceArticle_sourceId_externalId_key" ON "SourceArticle"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "InvestigationStatusHistory_outbreakId_effectiveAt_idx" ON "InvestigationStatusHistory"("outbreakId", "effectiveAt");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_startedAt_idx" ON "IngestionRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Outbreak" ADD CONSTRAINT "Outbreak_diseaseId_fkey" FOREIGN KEY ("diseaseId") REFERENCES "Disease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbreak" ADD CONSTRAINT "Outbreak_suspectedDiseaseId_fkey" FOREIGN KEY ("suspectedDiseaseId") REFERENCES "Disease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbreak" ADD CONSTRAINT "Outbreak_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Outbreak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutbreakLocation" ADD CONSTRAINT "OutbreakLocation_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutbreakLocation" ADD CONSTRAINT "OutbreakLocation_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutbreakObservation" ADD CONSTRAINT "OutbreakObservation_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutbreakObservation" ADD CONSTRAINT "OutbreakObservation_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutbreakUpdate" ADD CONSTRAINT "OutbreakUpdate_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutbreakUpdate" ADD CONSTRAINT "OutbreakUpdate_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceArticle" ADD CONSTRAINT "SourceArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceArticle" ADD CONSTRAINT "SourceArticle_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceArticle" ADD CONSTRAINT "SourceArticle_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "SourceArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationStatusHistory" ADD CONSTRAINT "InvestigationStatusHistory_outbreakId_fkey" FOREIGN KEY ("outbreakId") REFERENCES "Outbreak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationStatusHistory" ADD CONSTRAINT "InvestigationStatusHistory_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "SourceArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

