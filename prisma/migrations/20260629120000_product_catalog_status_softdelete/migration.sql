-- Product catalog lifecycle + soft delete.
-- Adds a draft/active status, a buyer-facing description, and a soft-delete
-- column (mirrors the vendors pattern: archived rows have a non-null
-- deleted_at and are excluded from normal admin queries, restorable by
-- clearing the column).

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('active', 'draft');

-- AlterTable
ALTER TABLE "product_catalog"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "status" "CatalogStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "product_catalog_status_idx" ON "product_catalog"("status");

-- CreateIndex
CREATE INDEX "product_catalog_deleted_at_idx" ON "product_catalog"("deleted_at");
