-- CreateEnum
CREATE TYPE "Emirate" AS ENUM ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah');

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "pickup_area" TEXT,
ADD COLUMN     "pickup_emirate" "Emirate";
