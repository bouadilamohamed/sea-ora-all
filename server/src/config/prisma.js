'use strict';
/* One PrismaClient for the whole process. Two would open two connection
   pools against the same database and, under nodemon, leak one per reload. */
const { PrismaClient } = require('@prisma/client');
const env = require('./env');

const prisma = globalThis.__seaoraPrisma || new PrismaClient({
  log: env.isProduction ? ['error'] : ['error', 'warn']
});

if (!env.isProduction) globalThis.__seaoraPrisma = prisma;

module.exports = prisma;
