'use strict';
/* ============================================================
   SEAORA — seed
   One sealed demo pearl holding one of each kind of memory, so that every UI
   state the experience can reach is visible the moment the app starts:

     photo  → the printed card, the story viewer's image
     video  → the play badge, the duration, the <video> story
     voice  → the corner pile, the waveform, real audio playback
     note   → the written page, in Cormorant italic

   The photograph, the poster frame and the voice note are GENERATED here —
   real WebP files and a real, playable WAV — so the seeded pearl has no
   broken URL and needs nothing downloaded.

   The film is the one thing a script cannot synthesise without ffmpeg. Drop
   any short .mp4 at server/prisma/assets/sample-video.mp4 and it is copied in;
   without it the memory is still created (its poster, badge and duration all
   render) and this script says exactly where to put the file.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

require('../src/config/env');
const env = require('../src/config/env');
const prisma = require('../src/config/prisma');
const storage = require('../src/services/storage');
const { hashSecret, randomId } = require('../src/utils/crypto');

const ASSETS = path.join(__dirname, 'assets');
const SAMPLE_VIDEO = path.join(ASSETS, 'sample-video.mp4');

/* ------------------------------------------------------------
   A photograph, painted rather than downloaded: warm light over deep water,
   the same palette the experience lives in.
   ------------------------------------------------------------ */
async function paintPhotograph(width, height, { top, mid, bottom, sun }) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${top}"/>
          <stop offset="46%" stop-color="${mid}"/>
          <stop offset="100%" stop-color="${bottom}"/>
        </linearGradient>
        <radialGradient id="sun" cx="62%" cy="16%" r="46%">
          <stop offset="0%" stop-color="${sun}" stop-opacity=".85"/>
          <stop offset="100%" stop-color="${sun}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="pearl" cx="36%" cy="30%" r="72%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="42%" stop-color="#fff0d4"/>
          <stop offset="74%" stop-color="#ffd9e8"/>
          <stop offset="100%" stop-color="#7fb8d0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#water)"/>
      <rect width="${width}" height="${height}" fill="url(#sun)"/>
      <g opacity=".22" fill="none" stroke="#dff3ff" stroke-width="2">
        <path d="M0 ${height * 0.62} Q ${width * 0.25} ${height * 0.55} ${width * 0.5} ${height * 0.63}
                 T ${width} ${height * 0.6}"/>
        <path d="M0 ${height * 0.72} Q ${width * 0.28} ${height * 0.66} ${width * 0.54} ${height * 0.74}
                 T ${width} ${height * 0.7}"/>
      </g>
      <circle cx="${width * 0.5}" cy="${height * 0.52}" r="${Math.min(width, height) * 0.13}"
              fill="url(#pearl)" opacity=".95"/>
      <g fill="#ffffff" opacity=".5">
        <circle cx="${width * 0.18}" cy="${height * 0.34}" r="5"/>
        <circle cx="${width * 0.24}" cy="${height * 0.22}" r="3"/>
        <circle cx="${width * 0.79}" cy="${height * 0.44}" r="4"/>
        <circle cx="${width * 0.85}" cy="${height * 0.3}" r="2.5"/>
      </g>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/* ------------------------------------------------------------
   A voice note that genuinely plays: a 16-bit PCM WAV built by hand, two
   soft chimes over a slow swell, so the waveform and the progress bar in the
   story viewer have something real to follow.
   ------------------------------------------------------------ */
function synthesiseVoice(seconds = 6, sampleRate = 22050) {
  const frames = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(frames * 2);

  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    // two chimes, each with its own decay, plus a slow breathing swell
    const chime = (at, freq) => {
      const dt = t - at;
      if (dt < 0) return 0;
      return Math.sin(2 * Math.PI * freq * dt) * Math.exp(-dt * 1.6);
    };
    const swell = 0.16 * Math.sin(2 * Math.PI * 0.42 * t) * Math.sin(2 * Math.PI * 196 * t);
    const value = 0.34 * chime(0.35, 523.25) + 0.26 * chime(2.6, 392.0) + swell;

    // a short fade at each end, so the note never starts or stops with a click
    const fade = Math.min(1, t / 0.12, Math.max(0, (seconds - t) / 0.35));
    const sample = Math.max(-1, Math.min(1, value * fade));
    data.writeInt16LE(Math.round(sample * 32767 * 0.8), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM chunk size
  header.writeUInt16LE(1, 20);           // format: PCM
  header.writeUInt16LE(1, 22);           // channels: mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);           // block align
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return { buffer: Buffer.concat([header, data]), seconds };
}

/* ------------------------------------------------------------ */

async function storeImage(buffer, base) {
  const full = await sharp(buffer)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer();
  const thumb = await sharp(buffer)
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 }).toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    mediaUrl: await storage.save('images', `${base}.webp`, full),
    thumbnailUrl: await storage.save('images', `${base}_t.webp`, thumb),
    width: meta.width || null,
    height: meta.height || null
  };
}

async function main() {
  const slug = env.demoSlug;
  console.log(`\n  🦪  Seeding the demo pearl "${slug}"…`);

  /* Idempotent: reseeding replaces the demo pearl and the files it owned, so
     running this twice does not leave two demos or a drift of orphan media. */
  const existing = await prisma.pearl.findUnique({
    where: { slug },
    include: { memories: true }
  });
  if (existing) {
    await storage.removeMany(
      existing.memories.flatMap(m => [m.mediaUrl, m.thumbnailUrl, m.posterUrl]).filter(Boolean)
    );
    await prisma.pearl.delete({ where: { id: existing.id } });
    console.log('      · previous demo removed');
  }

  /* ---------- the media ---------- */
  const photo = await storeImage(
    await paintPhotograph(1600, 1200, {
      top: '#1a6d8f', mid: '#0b304a', bottom: '#03151f', sun: '#ffeccd'
    }),
    randomId(16)
  );

  const posterBuffer = await paintPhotograph(1280, 720, {
    top: '#14506b', mid: '#0a2c3d', bottom: '#02090f', sun: '#cfe9ff'
  });
  const posterUrl = await storage.save(
    'images',
    `${randomId(16)}_p.webp`,
    await sharp(posterBuffer).webp({ quality: 74 }).toBuffer()
  );

  const voice = synthesiseVoice(6);
  const voiceUrl = await storage.save('audio', `${randomId(16)}.wav`, voice.buffer);

  /* The film. Copied when a sample was provided; otherwise the memory is
     created anyway — the card shows its poster and its duration, and the
     viewer already treats a film it cannot decode as a photograph on a
     timer, so nothing in the experience breaks. */
  let videoUrl = null;
  let videoNote = '';
  if (fs.existsSync(SAMPLE_VIDEO)) {
    videoUrl = await storage.save('videos', `${randomId(16)}.mp4`, fs.readFileSync(SAMPLE_VIDEO));
    videoNote = 'sample copied';
  } else {
    videoUrl = 'videos/sample-video.mp4';
    videoNote = 'placeholder — see the note below';
  }

  /* ---------- the pearl ---------- */
  const { hash, salt } = hashSecret(env.passcode);

  const pearl = await prisma.pearl.create({
    data: {
      slug,
      manageKey: randomId(24),
      status: 'SEALED',
      passHash: hash,
      passSalt: salt,
      passHint: 'Le nom de ce qui pousse dans le coquillage',
      title: 'Pour toi',
      subtitle: 'Quelques souvenirs cachés dans la perle',
      message:
        'Je voulais garder tout ça quelque part.\n' +
        'Pas dans un tiroir, pas sur un téléphone —\n' +
        'quelque part où il faut un peu de patience pour arriver.',
      autoplay: true,
      /* One sequence, deliberately INTERLEAVED — a photograph, then a voice,
         then a written page, then a film. `position` is the album's whole
         order now, so the demo pearl is the first thing that has to show it:
         the four kinds are not four piles, they are one album. */
      memories: {
        create: [
          {
            type: 'PHOTO',
            title: 'Le matin où la mer était calme',
            mediaUrl: photo.mediaUrl,
            thumbnailUrl: photo.thumbnailUrl,
            width: photo.width,
            height: photo.height,
            position: 0
          },
          {
            type: 'VOICE',
            title: 'Pour toi, ce matin',
            mediaUrl: voiceUrl,
            mimeType: 'audio/wav',
            duration: voice.seconds,
            position: 1
          },
          {
            type: 'NOTE',
            title: 'Le jour où tout a commencé',
            date: 'Été 2019',
            description:
              'On ne savait pas encore que c’était un début.\n\n' +
              'Il y avait le sel, la lumière basse, et cette idée idiote de ' +
              'ramasser un coquillage pour se souvenir d’une journée ordinaire.\n\n' +
              'C’est celle-là dont je me souviens le mieux.',
            position: 2
          },
          {
            type: 'VIDEO',
            title: 'Trois secondes de vagues',
            mediaUrl: videoUrl,
            posterUrl,
            mimeType: 'video/mp4',
            duration: 12,
            position: 3
          }
        ]
      }
    },
    include: { memories: true }
  });

  console.log(`      · pearl #${pearl.id} sealed  ·  ${pearl.memories.length} memories`);
  console.log(`      · photo   ${photo.mediaUrl}`);
  console.log(`      · poster  ${posterUrl}`);
  console.log(`      · voice   ${voiceUrl}  (${voice.seconds}s, generated WAV)`);
  console.log(`      · video   ${videoUrl}  (${videoNote})`);

  const base = env.publicUrl || `http://localhost:${env.port}`;
  console.log('\n      Open it:');
  console.log(`        ${env.clientUrl}/p/${slug}      (dev — Vite)`);
  console.log(`        ${base}/p/${slug}      (production — Express serves the build)`);
  console.log(`        passcode: PASSCODE from .env  (currently "${env.passcode}")`);

  if (!fs.existsSync(SAMPLE_VIDEO)) {
    console.log('\n      ℹ  No sample film was found, so the video memory points at a placeholder.');
    console.log('         Drop any short .mp4 here and reseed to make it play:');
    console.log(`           ${SAMPLE_VIDEO}`);
    console.log('         The card, its play badge and its duration already render without it.');
  }
  console.log('');
}

main()
  .catch(err => { console.error('\n  ✖ Seed failed:', err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
