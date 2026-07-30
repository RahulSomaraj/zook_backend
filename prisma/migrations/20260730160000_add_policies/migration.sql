-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policies_is_active_idx" ON "policies"("is_active");

-- CreateIndex
CREATE INDEX "policies_deleted_at_idx" ON "policies"("deleted_at");
