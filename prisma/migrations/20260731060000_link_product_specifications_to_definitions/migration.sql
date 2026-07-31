-- Links catalog-entry spec values to the category-level definitions that
-- describe them, and gives the table an updated_at.
--
-- The FK column added in 20260730121008 was camelCase ("categorySpecificationId")
-- while every other column in the database is snake_case; renaming it here is
-- safe because nothing has written to it yet.

-- ── Rename the FK column and its constraint to snake_case ────────────────
ALTER TABLE "product_specifications"
  RENAME COLUMN "categorySpecificationId" TO "category_specification_id";

ALTER TABLE "product_specifications"
  RENAME CONSTRAINT "product_specifications_categorySpecificationId_fkey"
  TO "product_specifications_category_specification_id_fkey";

-- ── updated_at ───────────────────────────────────────────────────────────
-- Added nullable, backfilled from created_at, then made NOT NULL, so the
-- migration survives a table that already holds rows.
ALTER TABLE "product_specifications" ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "product_specifications"
   SET "updated_at" = "created_at"
 WHERE "updated_at" IS NULL;

ALTER TABLE "product_specifications"
  ALTER COLUMN "updated_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX "product_specifications_category_specification_id_idx"
  ON "product_specifications"("category_specification_id");

-- One value per definition per catalog entry. Postgres treats NULLs as
-- distinct, so pre-existing rows with a null definition are unaffected.
CREATE UNIQUE INDEX "product_specifications_catalog_spec_key"
  ON "product_specifications"("catalog_id", "category_specification_id");
