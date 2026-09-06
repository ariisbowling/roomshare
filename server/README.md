# Self-hosting LiveKit on a spare laptop

Ports to forward on the router, all to the laptop's LAN IP:

| Port | Proto | For |
|---|---|---|
| 80 | TCP | Caddy cert issuance |
| 443 | TCP | Signaling (wss) |
| 7881 | TCP | WebRTC over TCP fallback |
| 7882 | UDP | WebRTC media |
| 3478 | UDP | TURN relay fallback |

On the laptop:

    git clone https://github.com/ariisbowling/roomshare && cd roomshare
    sudo bash server/install.sh

Then paste the three printed values into Vercel's env vars (and `.env.local`) and redeploy.

Useful:

    cd roomshare/server
    docker compose logs -f           # watch
    docker compose restart           # bounce
    docker compose pull && docker compose up -d   # update
