-- Normalize brand & category out of product_catalog into their own tables and
-- convert the free-text columns into foreign keys.
--
-- Order matters: create the lookup tables, backfill them from the distinct
-- values already in product_catalog, add nullable FK columns, populate them,
-- enforce NOT NULL + FKs, then drop the old string columns. This preserves all
-- existing catalog rows. Uses gen_random_uuid() (built into Postgres 13+ /
-- Supabase) and a simple slugifier for name -> slug.

-- ── Brand ────────────────────────────────────────────────────────────────
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");
CREATE INDEX "brands_is_active_idx" ON "brands"("is_active");
CREATE INDEX "brands_deleted_at_idx" ON "brands"("deleted_at");

-- ── Category ─────────────────────────────────────────────────────────────
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");
CREATE INDEX "categories_deleted_at_idx" ON "categories"("deleted_at");

-- ── Backfill lookup tables from existing distinct values ───────────────────
INSERT INTO "brands" ("id", "name", "slug")
SELECT gen_random_uuid(),
       b.brand,
       trim(both '-' from lower(regexp_replace(b.brand, '[^a-zA-Z0-9]+', '-', 'g')))
FROM (SELECT DISTINCT "brand" FROM "product_catalog") b;

INSERT INTO "categories" ("id", "name", "slug")
SELECT gen_random_uuid(),
       c.category,
       trim(both '-' from lower(regexp_replace(c.category, '[^a-zA-Z0-9]+', '-', 'g')))
FROM (SELECT DISTINCT "category" FROM "product_catalog") c;

-- ── Add FK columns (nullable for backfill) ─────────────────────────────────
ALTER TABLE "product_catalog"
  ADD COLUMN "brand_id" UUID,
  ADD COLUMN "category_id" UUID;

UPDATE "product_catalog" pc
   SET "brand_id" = b.id
  FROM "brands" b
 WHERE b.name = pc.brand;

UPDATE "product_catalog" pc
   SET "category_id" = c.id
  FROM "categories" c
 WHERE c.name = pc.category;

-- ── Swap constraints/indexes from the string columns to the FK columns ─────
DROP INDEX "product_catalog_brand_model_year_key";
DROP INDEX "product_catalog_category_idx";

ALTER TABLE "product_catalog"
  ALTER COLUMN "brand_id" SET NOT NULL,
  ALTER COLUMN "category_id" SET NOT NULL;

ALTER TABLE "product_catalog"
  DROP COLUMN "brand",
  DROP COLUMN "category";

CREATE UNIQUE INDEX "product_catalog_brand_id_model_year_key" ON "product_catalog"("brand_id", "model", "year");
CREATE INDEX "product_catalog_category_id_idx" ON "product_catalog"("category_id");
CREATE INDEX "product_catalog_brand_id_idx" ON "product_catalog"("brand_id");

ALTER TABLE "product_catalog"
  ADD CONSTRAINT "product_catalog_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_catalog"
  ADD CONSTRAINT "product_catalog_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
