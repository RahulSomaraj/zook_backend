-- Soft delete for vendors: archived rows have a non-null deleted_at and are
-- excluded from normal admin queries (restorable by clearing the column).
ALTER TABLE "vendors" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "vendors_deleted_at_idx" ON "vendors"("deleted_at");
