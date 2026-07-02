-- Orders domain (Phase 1, item 1.1): parent Order split into one SubOrder per
-- product per vendor, plus an append-only SubOrderStatusHistory ledger. Rates
-- are snapshotted onto sub_orders at sale time. Back-relations to vendors and
-- products are added via the FK columns below.
--
-- NOTE: hand-written because the migration could not be applied from this
-- environment (Supabase host unreachable + Prisma engine download blocked).
-- Mirrors what `prisma migrate dev --name orders_schema` would emit. Apply with
-- `npx prisma migrate deploy` (or resolve) once DIRECT_URL is reachable.

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('confirmed', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'ready', 'held', 'issued', 'redeemed');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "address_id" UUID,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "payment_id" UUID,
    "estimated_delivery_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_orders" (
    "id" UUID NOT NULL,
    "sub_order_number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "vendor_id" UUID,
    "product_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'confirmed',
    "sale_price" DECIMAL(10,2) NOT NULL,
    "commission_rate" DECIMAL(5,2) NOT NULL,
    "processing_fee" DECIMAL(10,2) NOT NULL,
    "payout_amount" DECIMAL(10,2) NOT NULL,
    "payout_status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "courier_name" TEXT,
    "awb_number" TEXT,
    "pack_photo_before_url" TEXT,
    "pack_photo_after_url" TEXT,
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_order_status_history" (
    "id" UUID NOT NULL,
    "sub_order_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_orders_sub_order_number_key" ON "sub_orders"("sub_order_number");

-- CreateIndex
CREATE INDEX "sub_orders_status_idx" ON "sub_orders"("status");

-- CreateIndex
CREATE INDEX "sub_orders_vendor_id_idx" ON "sub_orders"("vendor_id");

-- CreateIndex
CREATE INDEX "sub_orders_payout_status_idx" ON "sub_orders"("payout_status");

-- CreateIndex
CREATE INDEX "sub_orders_created_at_idx" ON "sub_orders"("created_at");

-- CreateIndex
CREATE INDEX "sub_order_status_history_sub_order_id_idx" ON "sub_order_status_history"("sub_order_id");

-- AddForeignKey
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_order_status_history" ADD CONSTRAINT "sub_order_status_history_sub_order_id_fkey" FOREIGN KEY ("sub_order_id") REFERENCES "sub_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
