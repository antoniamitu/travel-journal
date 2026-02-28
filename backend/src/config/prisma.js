// backend/src/config/prisma.js
import { PrismaClient } from "@prisma/client";

let prisma;

function parsePrismaLogLevels() {
  const raw = process.env.PRISMA_LOG_LEVELS;

  // Safe default: warnings + errors only
  if (!raw || !raw.trim()) return ["warn", "error"];

  const allowed = new Set(["query", "info", "warn", "error"]);
  const levels = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((lvl) => allowed.has(lvl));

  return levels.length ? levels : ["warn", "error"];
}

export function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: parsePrismaLogLevels()
    });
  }
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}