'use strict';
/* ============================================================
   POST /api/auth/passcode — the one door the experience knocks on.

   It answers the question the gate asks: "is this the code?" — and, only if
   it is, hands back the memories together with a short-lived read token.
   The passcode itself never travels the other way.
   ============================================================ */
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const serialize = require('../services/serialize.service');

/** GET /api/auth/gate?slug= — the door's wording. Never any media. */
const gate = asyncHandler(async (req, res) => {
  const slug = String(req.query.slug || '').trim();
  res.json(slug ? await authService.gate(slug) : await authService.demoGate());
});

const submit = asyncHandler(async (req, res) => {
  const { passcode, password, reference, slug } = req.body || {};

  const result = await authService.unlock({
    slug: String(slug || '').trim(),
    /* `passcode` is this endpoint's word for it; `password` is what the pearl
       routes have always called it. Both are accepted so one client shape
       fits both doors. */
    password: passcode ?? password,
    reference,
    ip: req.ip || '0.0.0.0'
  });

  /* The demo pearl was never seeded: the code was right, but there is nothing
     to send. The viewer falls back to its own built-in cards, exactly as it
     always has when opened without a gift. */
  if (result.demo) {
    return res.json({
      ok: true,
      demo: true,
      token: null,
      expiresAt: null,
      content: { title: 'Pour toi', subtitle: '', message: '', autoplay: true, createdAt: Date.now(), images: [], videos: [], audios: [], notes: [] }
    });
  }

  res.json({
    ok: true,
    demo: false,
    slug: result.pearl.slug,
    token: result.session.token,
    expiresAt: result.session.expiresAt,
    content: serialize.viewerContent(result.pearl, result.rows)
  });
});

module.exports = { gate, submit };
