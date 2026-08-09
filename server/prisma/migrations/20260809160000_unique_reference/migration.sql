-- The reference is engraved on ONE physical object, so it must identify one
-- gift and no other.
--
-- `ref_hash` cannot enforce that: it is scrypt with a per-row salt, so the
-- same reference produces a different value in every row. `ref_key` is the
-- same reference under a keyed digest — one deterministic value per
-- reference — which is what a unique index can be built on.
--
-- NULL is allowed and repeats freely: a pearl created without a reference has
-- none, and PostgreSQL does not consider two NULLs equal.
--
-- Existing rows keep ref_key NULL. They are not back-filled because the
-- reference itself is not recoverable from ref_hash — that is the point of
-- it. Gifts created before this migration therefore take part in uniqueness
-- only once their reference is set again.
ALTER TABLE "pearls" ADD COLUMN "ref_key" TEXT;

CREATE UNIQUE INDEX "pearls_ref_key_key" ON "pearls"("ref_key");
