CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL,
    "sub_order_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "awb_number" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "hub_name" TEXT,
    "failure_reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipment_events_event_key_key" ON "shipment_events"("event_key");
CREATE INDEX "shipment_events_sub_order_id_occurred_at_idx" ON "shipment_events"("sub_order_id", "occurred_at");

ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_sub_order_id_fkey"
    FOREIGN KEY ("sub_order_id") REFERENCES "sub_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
