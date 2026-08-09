-- One order per gift.
--
-- `position` used to be numbered inside each type: photographs 0,1,2 and
-- voices also 0,1,2, with the viewer reading the four groups one after
-- another. It is now the pearl's whole sequence.
--
-- Existing rows are renumbered in exactly the order the old viewer showed
-- them — photographs, then films, then voices, then written pages, each
-- keeping its own place — so no gift that already exists changes at all.
WITH ordered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY pearl_id
            ORDER BY
                CASE "type"
                    WHEN 'PHOTO' THEN 0
                    WHEN 'VIDEO' THEN 1
                    WHEN 'VOICE' THEN 2
                    ELSE 3
                END,
                "position",
                id
        ) - 1 AS seq
    FROM "memories"
)
UPDATE "memories" m
SET "position" = o.seq
FROM ordered o
WHERE m.id = o.id;

-- The album is read back by (pearl, position) now, not by (pearl, type,
-- position). The old index is kept: the per-kind counts and the limit checks
-- still filter on type.
CREATE INDEX "memories_pearl_id_position_idx" ON "memories"("pearl_id", "position");
