-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('prepaid', 'cod');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed');

-- AlterTable: existing orders default to prepaid/pending, so nothing already
-- placed is treated as paid until a server-side source records it.
ALTER TABLE "orders"
  ADD COLUMN "payment_method" "PaymentMethod" NOT NULL DEFAULT 'prepaid',
  ADD COLUMN "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "paid_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sub_orders"
  ADD COLUMN "package_weight_kg" DECIMAL(6,3),
  ADD COLUMN "cod_amount" DECIMAL(10,2);
