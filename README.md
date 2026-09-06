# roomshare

Low-latency screen share + voice for a few people. Next.js + LiveKit.

## Setup (once)

1. Go to https://cloud.livekit.io, sign up (free), create a project.
2. Settings -> Keys -> create key. Copy the API key, secret, and the wss:// URL.
3. Put them in `.env.local` (copy of `.env.local.example`).

## Run locally

    pnpm dev

Open http://localhost:3000, enter a name, click **Create new room**, send the 6-letter code to the other person.

## Deploy

    pnpm dlx vercel

Add the same three env vars in the Vercel project settings.

## Quality knobs

`src/app/room/[code]/RoomClient.tsx`:
- `SCREEN_BITRATE` (default 20 Mbps) and `SCREEN_FPS` (60)
- `contentHint: "detail"` for text/code; change to `"motion"` for video playback
- `videoCodec: "vp9"`; try `"av1"` in Chrome for sharper text at the same bitrate
