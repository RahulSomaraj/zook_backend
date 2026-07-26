-- CreateEnum
CREATE TYPE "PhotoCheckStatus" AS ENUM ('pending', 'passed', 'failed');

-- AlterTable
ALTER TABLE "sub_orders" ADD COLUMN     "pack_photo_before_status" "PhotoCheckStatus",
ADD COLUMN     "pack_photo_after_status" "PhotoCheckStatus",
ADD COLUMN     "photos_verified_at" TIMESTAMP(3);
