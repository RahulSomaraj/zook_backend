-- Platform fee configuration. Rates use the existing payout conventions:
-- mamo_fee_rate is a fraction (0.029 = 2.9%); commission_rate is a percentage.
CREATE TABLE "fee_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mamo_fee_rate" DECIMAL(7,6) NOT NULL DEFAULT 0.029,
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_settings_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "fee_settings_mamo_fee_rate_check" CHECK ("mamo_fee_rate" BETWEEN 0 AND 1),
    CONSTRAINT "fee_settings_commission_rate_check" CHECK ("commission_rate" BETWEEN 0 AND 100)
);

-- Seed the application's existing defaults. This does not change checkout
-- behavior or overwrite vendor-specific commissions or historical payouts.
INSERT INTO "fee_settings" ("id", "mamo_fee_rate", "commission_rate", "updated_at")
VALUES (1, 0.029, 10.0, CURRENT_TIMESTAMP);
