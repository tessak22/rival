-- Replace session-level advisory locks (unsafe with Prisma connection pooling)
-- with a dedicated lock table. The PRIMARY KEY on ip_hash makes concurrent
-- INSERTs mutually exclusive without requiring session affinity.
CREATE TABLE "demo_ip_locks" (
  "ip_hash"     TEXT        NOT NULL,
  "acquired_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "demo_ip_locks_pkey" PRIMARY KEY ("ip_hash")
);
