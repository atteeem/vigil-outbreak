-- AlterTable
ALTER TABLE "SourceArticle" ADD COLUMN     "classifierVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contentType" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
ADD COLUMN     "mentionedCountryCodes" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "outbreakRelevant" BOOLEAN NOT NULL DEFAULT true;

