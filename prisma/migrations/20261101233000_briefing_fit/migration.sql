-- Daily briefing: cached fit assessment per recommended job
ALTER TABLE "Job" ADD COLUMN "fitBrief" JSONB;
ALTER TABLE "Job" ADD COLUMN "fitBriefAt" TIMESTAMP(3);
