import dotenv from "dotenv";
dotenv.config({ override: true });
import { PrismaClient } from "@prisma/client";

// Prisma 7+ requires the connection URL to be passed to the constructor
// when using the new config-based setup (no url in schema.prisma).
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.MONGODB_URI,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}