-- Migration : ajout totpEnabled sur User (le secret est déjà dans twoFactorSecret)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
