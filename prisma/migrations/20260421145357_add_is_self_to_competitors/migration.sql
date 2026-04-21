-- AlterTable
ALTER TABLE "competitors" ADD COLUMN     "is_self" BOOLEAN NOT NULL DEFAULT false;

-- Enforce at most one Competitor row with is_self = true
CREATE UNIQUE INDEX "competitors_is_self_unique"
  ON "competitors" ("is_self") WHERE "is_self" = true;
