const clientModule = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__gogiScriptPrisma ||
  new clientModule.PrismaClient({
    log: ["error", "warn"],
  });

globalForPrisma.__gogiScriptPrisma = prisma;

module.exports = { prisma };
