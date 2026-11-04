-- Company research: refresh a company's profile from public sources, on demand or when she adds it
ALTER TABLE "Company" ADD COLUMN "researchStatus" TEXT;
ALTER TABLE "Company" ADD COLUMN "researchStartedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "researchedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "researchError" TEXT;
ALTER TABLE "Company" ADD COLUMN "researchSummary" TEXT;
ALTER TABLE "Company" ADD COLUMN "researchSources" JSONB;
ALTER TABLE "Company" ADD COLUMN "researchedFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
