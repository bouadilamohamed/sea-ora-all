# Seed assets

Everything the seed needs is generated in code — the photograph, the poster
frame and the voice note are painted and synthesised by `prisma/seed.js`, so a
fresh database has no broken media and nothing to download.

The one exception is the **film**. A valid MP4 cannot be synthesised without a
video encoder, and this service deliberately does not depend on ffmpeg.

## To make the seeded video memory play

Drop any short `.mp4` here, named exactly:

```
server/prisma/assets/sample-video.mp4
```

then reseed:

```bash
npm run db:seed
```

Without it, the video memory is still created: its card shows the generated
poster frame, the play badge and its duration, and the story viewer falls back
to the photograph's timer when a film will not decode — which is the same
behaviour a real gift has when a browser cannot play a codec.
