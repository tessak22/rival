import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL;
// Prisma 7's client engine requires an adapter even when a route is operating
// in offline fixture mode or a test has mocked all database calls. Keep the
// fallback local-only; any real query still requires a configured PostgreSQL
// DATABASE_URL and will fail clearly if PostgreSQL is not available.
const adapterUrl = databaseUrl ?? "postgresql://127.0.0.1:5432/rival";
const baseLogConfig: Prisma.LogLevel[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: baseLogConfig,
    adapter: new PrismaPg(adapterUrl)
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
