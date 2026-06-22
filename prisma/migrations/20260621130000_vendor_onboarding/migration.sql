-- AlterTable: track phone verification on users
ALTER TABLE "users" ADD COLUMN "phone_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: phone becomes unique (multiple NULLs allowed by Postgres)
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateTable: one row per OTP issued to a phone number (code stored hashed)
CREATE TABLE "phone_verifications" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'vendor_auth',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_verifications_phone_idx" ON "phone_verifications"("phone");
CREATE INDEX "phone_verifications_expires_at_idx" ON "phone_verifications"("expires_at");
