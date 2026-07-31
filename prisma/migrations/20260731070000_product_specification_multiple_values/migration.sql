-- A specification can offer several values (Storage → 128 GB / 256 GB / 512 GB),
-- so the single `value` column becomes a list. A single-valued spec is just a
-- one-element array.
--
-- The column is named spec_values rather than "values" because VALUES is a
-- reserved SQL keyword, which would force quoting in every hand-written query.
--
-- Added nullable, backfilled from the existing scalar, then made NOT NULL and
-- the old column dropped — so no recorded value is lost.

ALTER TABLE "product_specifications" ADD COLUMN "spec_values" TEXT[];

UPDATE "product_specifications"
   SET "spec_values" = ARRAY["value"]
 WHERE "spec_values" IS NULL;

ALTER TABLE "product_specifications"
  ALTER COLUMN "spec_values" SET NOT NULL;

ALTER TABLE "product_specifications" DROP COLUMN "value";
