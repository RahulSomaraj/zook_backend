-- Reverts the spec_values list back to a single scalar value.
--
-- The backfill joins rather than taking the first element, so if any
-- environment did record several values they survive as readable text instead
-- of being silently dropped. (The table was empty when this was written.)

ALTER TABLE "product_specifications" ADD COLUMN "value" TEXT;

UPDATE "product_specifications"
   SET "value" = array_to_string("spec_values", ' / ')
 WHERE "value" IS NULL;

ALTER TABLE "product_specifications"
  ALTER COLUMN "value" SET NOT NULL;

ALTER TABLE "product_specifications" DROP COLUMN "spec_values";
