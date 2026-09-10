-- Structured address components required by the courier. All nullable, so
-- every existing vendor and customer address stays valid; shipment creation
-- refuses with a 422 naming the missing field until they are filled in.
ALTER TABLE "vendors"
  ADD COLUMN "pickup_house_no" TEXT,
  ADD COLUMN "pickup_landmark" TEXT;

ALTER TABLE "customer_addresses"
  ADD COLUMN "house_no" TEXT,
  ADD COLUMN "area" TEXT;
