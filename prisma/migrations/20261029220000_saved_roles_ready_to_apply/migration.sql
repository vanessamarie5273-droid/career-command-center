-- Researching, Prioritized and Resume in Preparation are folded into Ready to Apply: a saved role waits there until she applies.
UPDATE "Application" SET "stage" = 'READY_TO_APPLY' WHERE "stage" IN ('RESEARCHING', 'PRIORITIZED', 'RESUME_PREP');
