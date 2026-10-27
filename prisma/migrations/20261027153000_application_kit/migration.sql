-- CreateTable
CREATE TABLE "Kit" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "baseResumeId" TEXT,
    "resumeDocId" TEXT,
    "letterDocId" TEXT,
    "parts" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kit_jobId_createdAt_idx" ON "Kit"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "Kit" ADD CONSTRAINT "Kit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
