CREATE TABLE "shipment_creations" (
    "sub_order_id" UUID NOT NULL,
    "awb_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shipment_creations_pkey" PRIMARY KEY ("sub_order_id"),
    CONSTRAINT "shipment_creations_sub_order_id_fkey"
      FOREIGN KEY ("sub_order_id") REFERENCES "sub_orders"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
