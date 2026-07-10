-- AlterTable
ALTER TABLE "customer_addresses"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "created_by" UUID,
ADD COLUMN "updated_by" UUID,
ADD COLUMN "deleted_by" UUID,
ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customer_addresses_is_active_idx" ON "customer_addresses"("is_active");

-- CreateIndex
CREATE INDEX "customer_addresses_deleted_at_idx" ON "customer_addresses"("deleted_at");
