-- The DEFAULT added when updated_at was backfilled is redundant: Prisma's
-- @updatedAt writes the column on every create and update. Dropping it keeps
-- the database in sync with the schema (and matches category_specifications,
-- whose updated_at carries no default either).

ALTER TABLE "product_specifications" ALTER COLUMN "updated_at" DROP DEFAULT;
