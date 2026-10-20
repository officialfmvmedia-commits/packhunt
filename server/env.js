// All runtime configuration comes from environment variables.
import path from 'path';
import { fileURLToPath } from 'url';
const __dir = path.dirname(fileURLToPath(import.meta.url));
const int = (v, d) => (v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
export const ENV = {
  PORT: int(process.env.PORT, 8787),
  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(__dir, '..', 'data')),
  SITE_DIR: path.resolve(__dir, '..', 'site'),
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',
  RPC_URL: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  VAULT_POLL_MS: int(process.env.VAULT_POLL_MS, 45000),
  MAX_PLAYERS: int(process.env.MAX_PLAYERS, 300),
  MAX_CONN_PER_IP: int(process.env.MAX_CONN_PER_IP, 8),
  TRUST_PROXY: process.env.TRUST_PROXY === '1' || process.env.RENDER === 'true',
  VIEW_RADIUS: int(process.env.VIEW_RADIUS, 160),
  MAX_VISIBLE: int(process.env.MAX_VISIBLE, 80),
  CLAIM_RADIUS: int(process.env.CLAIM_RADIUS, 5),
  SESSION_DAYS: int(process.env.SESSION_DAYS, 14),
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://huntpacks.fun',
  // Browser origins allowed to open the WebSocket (comma-separated). localhost/127.0.0.1 on any port always allowed.
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'https://huntpacks.fun,https://www.huntpacks.fun').split(',').map(s => s.trim()).filter(Boolean),
};
