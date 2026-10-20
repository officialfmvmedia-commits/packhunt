# Pack Hunt

A 3D open-world browser game. Creator fees from the token pay for card packs. The packs get opened, and every card is dropped somewhere on one shared low-poly island. Whoever reaches a card first with Phantom connected keeps it.

> **Name note:** the brand comes from one constant, `BRAND` in `site/assets/config.js`. To rename everything, run `node tools/rename-brand.mjs "New Name"`. It updates the config, the HTML title, meta and og fallbacks, and the favicon. After that, re-render `og.png` and `logo-512.png` with `tools/render-brand.cjs`.

## What's here

```
site/                     static site, no build step (Three.js r160 vendored in site/vendor)
  index.html              landing page: live 3D hero, how it works, card set, Fee Vault (DEMO), PLAY
  play.html               the game
  favicon.svg             code-drawn logo (assets/brand.js); assets/logo-512.png, assets/og.png
  data/drops.json         MOCK pack pulls and card drop locations (regenerate: node tools/gen-drops.mjs)
  assets/config.js        BRAND, network config, palette, rarity weights
  assets/terrain.js       deterministic island heightfield, shared by client and server
  assets/cards.js         24-card "Island Set 01" catalog, procedural canvas card faces and creature art
  assets/wallet.js        Phantom connect and signMessage verify (never requests a transaction)
  assets/audio.js         optional warm ambient pad (off by default, lowpassed, low gain)
  assets/game/*.js        world, avatar, creatures, drops, net (live and solo), main loop and UI
server/                   Node WebSocket world server (package "ws"); also serves ../site
tools/                    headless tests, screenshot and brand render scripts, drop generator, rename helper
shots/                    headless Chrome screenshots
```

## Run it

**Static only (solo mode):**
```
cd site && python3 -m http.server 8000      # open http://localhost:8000
```
With no world server available, the game switches to **solo demo** automatically. You get 5 simulated wandering hunters, mock pack pulls every 2.5 minutes, and claims saved in localStorage under your connected wallet.

**Shared world (multiplayer):**
```
cd server && npm install && npm start       # http://localhost:8787 (site + WebSocket on one port)
```
Everyone who opens that URL shares one island. The server syncs positions, names and colors at 10 Hz. Card claims are **server-authoritative**:
- the first claimer wins and later attempts get `already-claimed`
- a wallet is required
- the player must be within about 6 m of the card

It verifies Phantom's ed25519 `signMessage` signature using Node's built-in crypto, so it needs no extra dependencies. State persists to `server/data/state.json`. Delete that file to reset the island.

Environment variables:
- `PORT` (default 8787)
- `PULL_INTERVAL_MS`: how often a mock pack pull adds cards (default 240000)
- `MAX_DROPS` (default 90)

If you host the static site somewhere else and the server separately, set `NET.wsUrl` in `site/assets/config.js` to the server's `wss://` URL. Otherwise the client only tries a socket when the page is served by the bundled server, which it detects from the `x-packhunt-server` response header. That keeps static hosting free of console errors.

## Controls
- **WASD / arrows**: move
- **Shift**: sprint
- **Space**: jump
- **Drag**: orbit camera
- **Wheel**: zoom
- **E**: talk to a Packling or grab a card
- **I / Tab**: binder
- **M**: sound
- **Esc**: close

On mobile you get a touch joystick, drag-to-look, and Jump and E buttons.

Walk into a glowing card beam with Phantom connected and the card is claimed automatically. Packlings (Bitbun, Gpupup, Mintmoth, Hashowl, Ledgetoad, Tokkit) give hints and mark the nearest drop on your compass.

## Demo / mock disclaimers
- **Fee Vault numbers, pack pulls and drops are mock demo data**, labeled DEMO in the UI. Nothing reads or writes the chain, nothing moves funds, and the game never asks for a transaction.
- Phantom is used only for `connect()` and an optional `signMessage` (sign-in proof).
- Cards are off-chain records. In live mode they live in server state. In solo mode they live in browser localStorage.
- All creatures, cards and logos are original, procedural code art.

## Tests
```
NODE_PATH=/path/to/puppeteer-core/node_modules node tools/test-game.cjs http://127.0.0.1:8000 shots 1   # mock-Phantom walkthrough + screenshots
node tools/ws-race.mjs ws://localhost:8787                                                          # first-claimer-wins race (needs server running)
```
