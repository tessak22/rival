import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL;
const baseLogConfig: Prisma.LogLevel[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: baseLogConfig,
    adapter: databaseUrl ? new PrismaPg(databaseUrl) : undefined
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
