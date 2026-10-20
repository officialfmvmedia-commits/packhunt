# Pack Hunt · https://huntpacks.fun

A shared 3D island in the browser. Creator fees go to a public Solana treasury, the fees buy **real card packs**, and every card we pull gets dropped live somewhere on the island. The first verified Phantom wallet to reach a card wins the real card. We contact the winner and ship it.

- Treasury (public address only): `HXjDKgKuHghBx52coJmYLbH83g7KkKSWrHce5zkDkgJj`. The site and server **never** need its private key.
- Official X: [@trypackhunt](https://x.com/trypackhunt) (`X_URL` in `site/assets/config.js`)
- There is no mock data. The vault numbers come from Solana mainnet, and the drops and finds are real admin and player events.

## Run locally
```
npm install
ADMIN_TOKEN=$(openssl rand -hex 32) npm start          # http://localhost:8787  (site + API + WebSocket on one port)
```
`npm install && npm start` also works with nothing set. In that case admin routes stay disabled and data goes to `./data`.

## Environment
| var | default | notes |
|---|---|---|
| `PORT` | 8787 | Render sets this |
| `DATA_DIR` | `./data` | `world.json` (atomic writes + `.bak`) and `media/` (card images). Use `/var/data` on Render |
| `ADMIN_TOKEN` | unset, admin disabled | at least 24 chars; generate with `openssl rand -hex 32`. Compared in constant time |
| `RPC_URL` | `https://api.mainnet-beta.solana.com` | the public RPC is rate-limited; use Helius or another paid RPC in production |
| `VAULT_POLL_MS` | 45000 | treasury poll interval |
| `ALLOWED_ORIGINS` | `https://huntpacks.fun,https://www.huntpacks.fun` | WS origin allow-list (localhost/127.0.0.1 are always allowed) |
| `PUBLIC_URL` | `https://huntpacks.fun` | |
| `TRUST_PROXY` | auto on Render | use X-Forwarded-For for per-IP limits |
| `MAX_PLAYERS` / `MAX_CONN_PER_IP` | 300 / 8 | over the cap, players see "Island is full" and retry automatically |

## Drop real cards (admin)
```
export ADMIN_TOKEN=...  PACKHUNT_URL=https://huntpacks.fun
node tools/drop.mjs --name "Charizard ex" --set "Obsidian Flames" --rarity legendary \
  --image ./zard.jpg --qty 1 --pack "Obsidian Flames Booster" --cost-sol 0.5 --tx <purchase proof> \
  --serial PSA-12345 --value-usd 120 --near "Signal Tower"
node tools/drop.mjs --file pack.json      # a whole pack: { pack, costSol, tx, near, cards: [...] }
```
- `--image` takes a URL or a local file (png/jpg/webp/gif, max 8 MB). Images are stored in `DATA_DIR/media`. If a card has no image, a procedural face is used.
- Each call is one "pack opened". `--cost-sol` is added to "Spent on packs".
- Each card lands on a random valid land spot, spread apart, or near a landmark with `--near`: plaza, obelisk, arch, tower, vault, henge.
- Everyone online gets the announcement instantly, for example "A LEGENDARY just dropped near Signal Tower!".
- `node tools/admin.mjs drops | remove <dropId> | vault`

## Claims and fulfilment
- To claim, a player connects Phantom and signs a server-issued nonce message. It is never a transaction. The server verifies the ed25519 signature and issues a 14-day session.
- Claims are server-authoritative: the first claim wins, the player must be within 5 m by the server's tracked position, and there are speed/teleport checks, rate limits, and a cooldown.
- Each find stores the winner's wallet, the card and the time. The public Found log (landing page and `F` in game) shows shortened wallets and status.
- `node tools/fulfil.mjs list` and `node tools/fulfil.mjs <findId> shipped --note "tracking 123"`. Statuses: pending, contacted, shipped, sent, delivered, cancelled.
- To confirm a winner, ask them to sign a message with the winning wallet. Never ask for a seed phrase or a transaction.

## API
`/healthz` · `/api/vault` · `/api/state` · `/api/feed` · `/api/finds` · `/api/drops` · `/api/binder?wallet=` · `/media/*`. Admin endpoints (Bearer token): `POST /admin/drop`, `GET /admin/drops`, `DELETE /admin/drops/:id`, `GET /admin/finds`, `POST /admin/finds/:id`.

## Deploy (Render)
`render.yaml` defines one Node web service: build `npm install`, start `npm start`, health check `/healthz`, a 1 GB disk at `/var/data`, and `DATA_DIR=/var/data`. Set `ADMIN_TOKEN` and `RPC_URL` in the dashboard (they are `sync: false`). A disk needs a paid plan (Starter), which also keeps the service from sleeping. For DNS, point `huntpacks.fun` and `www` at the Render service as custom domains. Render provides TLS, and the client uses same-origin `wss://`.

## Tests
```
ADMIN_TOKEN=... MAX_CONN_PER_IP=200 DATA_DIR=/tmp/phtest npm start      # in one shell
ADMIN_TOKEN=... NODE_PATH=<dir containing puppeteer-core> node tests/e2e.mjs shots 50
```
This runs 2 headless browsers with mock Phantom keys (throwaway ed25519) and 50 ws bots. It checks admin drops, instant announcements, the claim race, anti-cheat, forged signatures, the binder, fulfilment, the landing page's live data, and console errors. Wipe `DATA_DIR` afterwards.

## Layout
`server/` (env, store, solana vault poller, admin, game world, static) · `site/` (no build step; Three.js vendored) · `tools/` (drop, fulfil, admin, brand render/rename) · `tests/e2e.mjs`

Controls: WASD to move, Shift to sprint, Space to jump, drag to look, E to talk or grab, I/Tab for my finds, F for the Found log, M for sound. Touch controls on mobile.
