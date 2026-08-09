/* ============================================================
   A written memory, full screen.
   The page is the print: warm paper, a title in Cormorant italic, the date
   the sender wrote in their own words, and the letter itself — line breaks
   kept, measure held at 38 characters where the eye still finds the next line.
   ============================================================ */
export default function NoteMemory({ item, fallbackDate }) {
  return (
    <div className="story-note">
      <h3>{item.title || 'Sans titre'}</h3>
      <p className="d">{item.day || fallbackDate}</p>
      <p>{item.body || ''}</p>
    </div>
  );
}
