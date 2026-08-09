import { memo, useMemo, useState } from 'react';
import { MicIcon, PlayIcon, PauseIcon } from '../ui/icons';
import { mmssOrBlank, waveHeights } from '../../utils/format';

/* ============================================================
   One printed memory.

   A photograph, a film, a voice and a written page are the same print — warm
   paper, soft corners, a window, and the words that belong to it underneath.
   Only what is mounted in the window changes:

     photograph   the picture, contained, never cropped
     film         the frame its sender's browser grabbed, with a play badge
     voice        a microphone struck into the paper, its waveform under it —
                  a record sleeve rather than a player
     written page no window at all; the words ARE the print

   The voice card is the one that had to be invented. A recording has nothing
   to show, so what goes in the window is the OBJECT: a warm medallion, the
   shape of the sound, and how long it runs. It is the most personal thing in
   most of these gifts and it now takes the same room as a photograph.

   Memoised: the pile re-renders whenever the position changes, and a card
   whose contents did not change must not throw away the DOM node its
   transition is currently running on. `playing` is a boolean rather than the
   voice API so that a note starting re-renders ONE card, not twelve.
   ============================================================ */

const CARD_BARS = 30;

function MemoryCard({
  item, index, visibleAhead, albumDate, registerCard, playing, onToggleVoice
}) {
  const [broken, setBroken] = useState(false);

  const isNote = item.kind === 'note';
  const isVideo = item.kind === 'video';
  const isVoice = item.kind === 'voice';

  /* The same seed the full-screen player uses, so the shape a note shows on
     its card is the shape it shows when it is opened. It is not an analysis
     of the audio: reading the samples would mean decoding every recording the
     moment the pearl opens, which is exactly what this application goes out of
     its way not to do. */
  const heights = useMemo(
    () => (isVoice ? waveHeights(item.voiceIndex ?? index, CARD_BARS) : null),
    [isVoice, item.voiceIndex, index]
  );

  /* Cards show the THUMBNAIL and nothing else. Pulling every full-size photo
     in behind them was the reason a pearl with a dozen souvenirs crawled: the
     full image is fetched only when a memory is opened. */
  const src = isVideo ? (item.poster || '') : (item.thumb || item.src || '');
  const length = isVideo || isVoice ? mmssOrBlank(item.seconds) : '';

  /* The legend under the print. A written page keeps its words inside the
     window, so it has none; everything else shows the caption its sender
     wrote — a photograph's caption, a film's, or a voice note's label. */
  const legend = isNote ? '' : (item.caption || '');

  return (
    <article
      className={[
        'pcard',
        isNote ? 'is-note' : '',
        isVoice ? 'is-voice' : '',
        isVoice && playing ? 'is-playing' : ''
      ].filter(Boolean).join(' ')}
      ref={el => registerCard(index, el)}
      data-index={index}
    >
      <div className="pcard-win">
        {isNote ? (
          <>
            <div className="note-rule" aria-hidden="true" />
            <h3 className="note-title">{item.title || 'Sans titre'}</h3>
            {item.day && <p className="note-day">{item.day}</p>}
            <p className="note-body">{item.body || ''}</p>
          </>
        ) : isVoice ? (
          <>
            <div className="vm-medal" aria-hidden="true">
              <MicIcon />
              <span className="vm-halo" />
            </div>

            <div className="vm-wave" aria-hidden="true">
              {heights.map((h, i) => (
                <i key={i} style={{ '--h': h.toFixed(2), '--i': i }} />
              ))}
            </div>

            {/* The only control on any card in the pile.
                Nothing plays by itself, so a recording needs a way to be
                started without leaving the album — and it must be a real
                button, not the card, or a reader who wanted to listen would
                be thrown into full screen instead.

                It stops the pointer reaching the pile underneath: pressing
                play may not begin a drag, and may not open the memory. */}
            <button
              type="button"
              className="vm-play"
              aria-label={playing ? 'Mettre en pause' : 'Écouter ce message'}
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onToggleVoice?.(item.voiceIndex); }}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>

            <div className="vm-line">
              <span className="vm-kicker">Message vocal</span>
              {length && <span className="vm-dot" aria-hidden="true" />}
              {length && <span className="vm-dur">{length}</span>}
            </div>
          </>
        ) : (
          <>
            {src && !broken && (
              <img
                src={src}
                alt={item.caption || `souvenir ${index + 1}`}
                decoding="async"
                draggable={false}
                /* the first few are wanted immediately; the rest can wait
                   until the pile is walked that far */
                loading={index > visibleAhead ? 'lazy' : 'eager'}
                onError={() => setBroken(true)}
              />
            )}
            {(!src || broken) && (
              <div className="pcard-missing">
                {isVideo ? 'Film indisponible' : 'Image indisponible'}
              </div>
            )}
            {isVideo && (
              <div className="pcard-play" aria-hidden="true">
                <i><PlayIcon /></i>
              </div>
            )}
            {isVideo && length && <div className="pcard-dur">{length}</div>}
          </>
        )}
      </div>

      {/* An empty caption is not rendered at all — an empty element would still
          take its line and leave a gap under prints that were never given
          words. The date stands alone in that case. */}
      <div className="pcard-foot">
        {legend && <div className="pcard-cap">{legend}</div>}
        <div className="pcard-date">{isNote && item.day ? item.day : albumDate}</div>
      </div>
    </article>
  );
}

export default memo(MemoryCard);
