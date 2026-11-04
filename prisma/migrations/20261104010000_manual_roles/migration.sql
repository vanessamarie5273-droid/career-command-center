-- Roles added by hand (unposted roles heard about in feed comments or from contacts)
ALTER TABLE "Job" ADD COLUMN "notes" TEXT;
ALTER TABLE "Job" ADD COLUMN "foundUrl" TEXT;
ALTER TABLE "Job" ADD COLUMN "referrerId" TEXT;
ALTER TABLE "Job" ADD CONSTRAINT "Job_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
