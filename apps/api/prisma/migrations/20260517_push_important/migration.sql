-- Types de notification « importants » : contournent les modes silencieux et discret.

ALTER TABLE "User" ADD COLUMN "pushImportantKinds" TEXT[] NOT NULL DEFAULT ARRAY['security']::TEXT[];
