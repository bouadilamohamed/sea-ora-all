'use strict';
/* ============================================================
   Boot.
   The banner exists because the two things that silently break this service
   are both invisible from the machine it runs on: a PUBLIC_URL that names an
   address no phone can reach (every QR code becomes a dead link), and a
   missing ADMIN_KEY (the console never opens).
   ============================================================ */
const os = require('os');
const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const storage = require('./services/storage');
const sessionService = require('./services/session.service');

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push({ name, address: net.address });
    }
  }
  return out;
}

async function main() {
  /* Fail loudly here rather than on the first request: a server that answers
     500 to everything because the database is unreachable is harder to
     diagnose than one that refuses to start. */
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('\n  ✖ PostgreSQL est injoignable.');
    console.error(`    ${err.message}`);
    console.error('    Vérifiez DATABASE_URL dans .env, puis `npm run db:migrate`.\n');
    process.exit(1);
  }

  const server = app.listen(env.port, '0.0.0.0', () => {
    const lan = lanAddresses();

    console.log('\n  🦪  SEAORA — La Perle');
    console.log('\n      sur cette machine');
    console.log(`        API      →  http://localhost:${env.port}/api/health`);
    console.log(`        client   →  ${env.clientUrl}  (npm run dev)`);
    console.log(`        panneau  →  ${env.clientUrl}/panel`);
    console.log(`        admin    →  ${env.clientUrl}/admin`);
    console.log(`        médias   →  ${storage.name === 'database'
      ? 'PostgreSQL (media_blobs)' : env.uploadDir}`);

    if (lan.length) {
      console.log('\n      depuis un autre appareil du même réseau');
      lan.forEach(n => console.log(`        ${n.name.padEnd(14)}→  http://${n.address}:${env.port}`));
    }

    if (env.publicUrl) {
      console.log(`\n      PUBLIC_URL  →  ${env.publicUrl}`);
      const known = lan.map(n => n.address).concat('localhost', '127.0.0.1');
      if (!known.some(a => env.publicUrl.includes(a))) {
        console.log('        ⚠  cette adresse ne correspond à aucune interface locale.');
        console.log('           Les QR codes générés pointeront ailleurs.');
      }
    } else if (lan.length) {
      console.log("\n      ⚠  PUBLIC_URL n'est pas définie.");
      console.log('         Un QR code généré depuis localhost encodera « localhost »');
      console.log('         et ne s’ouvrira pas sur un téléphone. Ajoutez dans .env :');
      console.log(`           PUBLIC_URL=http://${lan[0].address}:${env.port}`);
    }

    if (!env.adminKey) {
      console.log('\n      ⚠  ADMIN_KEY absente de .env — /admin restera fermé.');
    }
    console.log('');
  });

  /* Housekeeping: dead sessions and stale attempt records, hourly. */
  const housekeeping = setInterval(() => { sessionService.prune().catch(() => {}); }, 3600e3);
  housekeeping.unref();
  sessionService.prune().catch(() => {});

  const shutdown = signal => {
    console.log(`\n  ${signal} — fermeture…`);
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
    // a connection that refuses to drain must not hold the process forever
    setTimeout(() => process.exit(0), 8000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
