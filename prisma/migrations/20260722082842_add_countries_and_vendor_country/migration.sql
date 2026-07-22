-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "country_id" UUID;

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "dial_code" TEXT,
    "currency_code" TEXT NOT NULL,
    "currency_name" TEXT NOT NULL,
    "currency_symbol" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1.0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");

-- CreateIndex
CREATE INDEX "countries_is_active_idx" ON "countries"("is_active");

-- CreateIndex
CREATE INDEX "countries_deleted_at_idx" ON "countries"("deleted_at");

-- CreateIndex
CREATE INDEX "vendors_country_id_idx" ON "vendors"("country_id");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
