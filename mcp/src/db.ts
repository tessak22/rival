import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;

// Only provide the adapter when DATABASE_URL is available.
// In test environments the entire module is replaced by vi.mock,
// so this constructor never runs. In production, DATABASE_URL is required.
export const prisma = databaseUrl
  ? new PrismaClient({
      adapter: new PrismaPg(databaseUrl),
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    })
  : new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
