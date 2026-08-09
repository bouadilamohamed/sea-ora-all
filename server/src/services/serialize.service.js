'use strict';
/* ============================================================
   The shapes the browser sees.

   Two vocabularies come out of this file, on purpose:

   · the VIEWER shape — images[] / videos[] / audios[] / notes[], with `src`,
     `thumb`, `poster`, `caption`, `seconds`. It is the payload the finished
     experience has always consumed, and it stays byte-for-byte compatible so
     the gate, the pile and the story viewer keep their exact behaviour.

   · the MEMORY shape — one flat list of {id, type, title, description, date,
     mediaUrl, thumbnailUrl, posterUrl, duration, position}. It is what
     /api/memories speaks, and what the builder edits.

   Both are projections of the same rows. Nothing else in the server formats
   a response by hand.
   ============================================================ */
const { mediaUrl } = require('../utils/urls');

const TYPES = { PHOTO: 'photo', VIDEO: 'video', VOICE: 'voice', NOTE: 'note' };
const TYPE_FROM_PUBLIC = { photo: 'PHOTO', video: 'VIDEO', voice: 'VOICE', note: 'NOTE' };

/** One memory, in the flat shape /api/memories speaks. */
function memory(row) {
  return {
    id: row.id,
    type: TYPES[row.type],
    title: row.title || '',
    description: row.description || '',
    date: row.date || '',
    mediaUrl: mediaUrl(row.mediaUrl),
    thumbnailUrl: mediaUrl(row.thumbnailUrl),
    posterUrl: mediaUrl(row.posterUrl),
    mimeType: row.mimeType || '',
    duration: row.duration ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const memories = rows => rows.map(memory);

const only = (rows, type) => rows.filter(r => r.type === type);

/* ------------------------------------------------------------
   The album, in ONE order.

   `rows` arrive sorted by `position`, which is the pearl's whole sequence —
   the order its author added things in. This projects them into the shape the
   pile reads, with the fields that carry meaning for each kind and nulls for
   the rest, so a card never has to ask what sort of thing it is holding twice.

   `voiceIndex` is a recording's place among the AUDIO ELEMENTS, which is not
   its place in the album. Everything that plays a sound wants the first
   number; everything that draws a card wants the second. Computing it here is
   what keeps the browser from having to derive it and get it wrong.
   ------------------------------------------------------------ */
function album(rows) {
  let voices = 0;
  return rows.map((r, i) => {
    const kind = TYPES[r.type];
    const base = {
      id: r.id,
      kind,
      caption: r.title || '',
      position: r.position
    };
    if (kind === 'photo') {
      return {
        ...base,
        src: mediaUrl(r.mediaUrl),
        thumb: mediaUrl(r.thumbnailUrl),
        width: r.width,
        height: r.height
      };
    }
    if (kind === 'video') {
      return {
        ...base,
        caption: r.title || `Vidéo ${i + 1}`,
        src: mediaUrl(r.mediaUrl),
        poster: mediaUrl(r.posterUrl),
        mime: r.mimeType || '',
        seconds: r.duration ?? null
      };
    }
    if (kind === 'voice') {
      return {
        ...base,
        caption: r.title || `Voix ${voices + 1}`,
        label: r.title || `Voix ${voices + 1}`,
        src: mediaUrl(r.mediaUrl),
        mime: r.mimeType || '',
        seconds: r.duration ?? null,
        voiceIndex: voices++
      };
    }
    return {
      ...base,
      caption: r.title || '',
      title: r.title || '',
      day: r.date || '',
      body: r.description || ''
    };
  });
}

/* ------------------------------------------------------------
   The viewer payload.

   `memories` is what the pile actually reads: one album, in the author's
   order, photographs and films and voices and written pages interleaved
   exactly as they were added.

   The four grouped arrays are still here and still correct. `audios` in
   particular is not decoration — the browser builds one HTMLAudioElement per
   recording from it, and `voiceIndex` above indexes into that same array.
   ------------------------------------------------------------ */
function viewerContent(pearl, rows) {
  return {
    title: pearl.title,
    subtitle: pearl.subtitle,
    message: pearl.message || '',
    autoplay: pearl.autoplay,

    memories: album(rows),
    /* The day the pearl was sealed — the album's date under each print.
       The photographs carry none of their own: EXIF is stripped on upload. */
    createdAt: pearl.createdAt instanceof Date ? pearl.createdAt.getTime() : pearl.createdAt,

    images: only(rows, 'PHOTO').map(r => ({
      id: r.id,
      src: mediaUrl(r.mediaUrl),
      thumb: mediaUrl(r.thumbnailUrl),
      width: r.width,
      height: r.height,
      caption: r.title || ''
    })),

    videos: only(rows, 'VIDEO').map((r, i) => ({
      id: r.id,
      src: mediaUrl(r.mediaUrl),
      mime: r.mimeType || '',
      poster: mediaUrl(r.posterUrl),
      caption: r.title || `Vidéo ${i + 1}`,
      seconds: r.duration ?? null
    })),

    /* `seconds` rides along so a voice card can print its length without
       touching the file — otherwise a pearl with eight notes opens eight
       connections nobody asked for the moment it is revealed. */
    audios: only(rows, 'VOICE').map((r, i) => ({
      id: r.id,
      src: mediaUrl(r.mediaUrl),
      mime: r.mimeType || '',
      label: r.title || `Voix ${i + 1}`,
      seconds: r.duration ?? null
    })),

    notes: only(rows, 'NOTE').map(r => ({
      id: r.id,
      title: r.title || '',
      day: r.date || '',
      body: r.description || ''
    }))
  };
}

/* ------------------------------------------------------------
   The builder payload. Every write answers with the WHOLE gift, so the
   workshop never has to guess what changed: it redraws from one truth.

   `items` is the album in the author's order — the one list the workshop
   edits. The grouped arrays below it are kept because the counts are still
   per kind, and so are the limits.
   ------------------------------------------------------------ */
function giftContent(pearl, rows, { limits, viewerUrl }) {
  return {
    slug: pearl.slug,
    status: pearl.status,
    sealed: pearl.status === 'SEALED',
    message: pearl.message || '',
    createdAt: pearl.createdAt instanceof Date ? pearl.createdAt.getTime() : pearl.createdAt,
    updatedAt: pearl.updatedAt instanceof Date ? pearl.updatedAt.getTime() : pearl.updatedAt,
    viewerUrl,
    limits,

    items: album(rows),

    photos: only(rows, 'PHOTO').map(r => ({
      id: r.id,
      src: mediaUrl(r.mediaUrl),
      thumb: mediaUrl(r.thumbnailUrl),
      width: r.width,
      height: r.height,
      caption: r.title || ''
    })),
    videos: only(rows, 'VIDEO').map((r, i) => ({
      id: r.id,
      src: mediaUrl(r.mediaUrl),
      mime: r.mimeType || '',
      poster: mediaUrl(r.posterUrl),
      label: r.title || `Vidéo ${i + 1}`,
      seconds: r.duration ?? null
    })),
    voices: only(rows, 'VOICE').map((r, i) => ({
      id: r.id,
      src: mediaUrl(r.mediaUrl),
      mime: r.mimeType || '',
      label: r.title || `Voix ${i + 1}`,
      seconds: r.duration ?? null
    })),
    notes: only(rows, 'NOTE').map(r => ({
      id: r.id,
      title: r.title || '',
      day: r.date || '',
      body: r.description || ''
    }))
  };
}

module.exports = { memory, memories, viewerContent, giftContent, TYPES, TYPE_FROM_PUBLIC };
