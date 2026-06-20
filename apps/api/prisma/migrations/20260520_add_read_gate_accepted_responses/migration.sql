-- Replace readGateAutoApprove with readGateAcceptedResponses
ALTER TABLE "Entry"
ADD COLUMN "readGateAcceptedResponses" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "Entry"
DROP COLUMN IF EXISTS "readGateAutoApprove";
