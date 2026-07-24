-- CreateTable
CREATE TABLE "product_specifications" (
    "id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "group" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_specifications_catalog_id_idx" ON "product_specifications"("catalog_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_specifications_catalog_id_label_key" ON "product_specifications"("catalog_id", "label");

-- AddForeignKey
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "product_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
