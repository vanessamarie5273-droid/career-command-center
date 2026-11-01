-- Instant alerts
ALTER TABLE "User" ADD COLUMN "instantAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Job" ADD COLUMN "alertedAt" TIMESTAMP(3);
-- Roles already in the app have been seen; only roles found from now on trigger an instant alert.
UPDATE "Job" SET "alertedAt" = CURRENT_TIMESTAMP;

-- Outlook mailbox
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL DEFAULT 'outlook',
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "applicationId" TEXT,
    "companyId" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT,
    "prevStage" "Stage",
    "newStage" "Stage",
    "prevApplied" BOOLEAN,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailEvent_providerId_key" ON "EmailEvent"("providerId");
CREATE INDEX "EmailEvent_applicationId_receivedAt_idx" ON "EmailEvent"("applicationId", "receivedAt");
CREATE INDEX "EmailEvent_createdAt_idx" ON "EmailEvent"("createdAt");
