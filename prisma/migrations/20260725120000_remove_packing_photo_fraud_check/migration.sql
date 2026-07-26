-- Remove the packing-photo fraud-check feature: drop the per-photo status
-- columns and the enum type. `photos_verified_at` is kept (now means "both
-- packing photos uploaded").

-- AlterTable
ALTER TABLE "sub_orders" DROP COLUMN "pack_photo_before_status",
DROP COLUMN "pack_photo_after_status";

-- DropEnum
DROP TYPE "PhotoCheckStatus";
