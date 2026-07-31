-- AlterTable
ALTER TABLE "product_specifications" ADD COLUMN     "categorySpecificationId" UUID;

-- CreateTable
CREATE TABLE "category_specifications" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "category_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_specifications_category_id_idx" ON "category_specifications"("category_id");

-- CreateIndex
CREATE INDEX "category_specifications_is_active_idx" ON "category_specifications"("is_active");

-- CreateIndex
CREATE INDEX "category_specifications_deleted_at_idx" ON "category_specifications"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "category_specifications_category_id_label_key" ON "category_specifications"("category_id", "label");

-- AddForeignKey
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_categorySpecificationId_fkey" FOREIGN KEY ("categorySpecificationId") REFERENCES "category_specifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_specifications" ADD CONSTRAINT "category_specifications_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
