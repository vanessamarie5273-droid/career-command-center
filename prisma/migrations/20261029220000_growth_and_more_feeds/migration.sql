-- More first-party job feeds
ALTER TYPE "AtsProvider" ADD VALUE 'WORKABLE';
ALTER TYPE "AtsProvider" ADD VALUE 'AMAZON';
ALTER TYPE "AtsProvider" ADD VALUE 'ORACLE';

-- Growth potential (AI assessment)
ALTER TABLE "Company" ADD COLUMN "growthScore" INTEGER;
ALTER TABLE "Company" ADD COLUMN "growthThesis" TEXT;
