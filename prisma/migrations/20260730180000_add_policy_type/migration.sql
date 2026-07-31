-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('terms_and_conditions', 'privacy_policy');

-- AlterTable: add with a temporary default to backfill existing rows, then drop
-- the default so new inserts must specify the type explicitly.
ALTER TABLE "policies" ADD COLUMN "type" "PolicyType" NOT NULL DEFAULT 'terms_and_conditions';
ALTER TABLE "policies" ALTER COLUMN "type" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "policies_type_idx" ON "policies"("type");
