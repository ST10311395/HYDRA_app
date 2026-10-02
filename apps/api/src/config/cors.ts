import type { AppConfig } from './env';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** RFC 1918 private IPv4 ranges — the addresses a dev machine has on home/office/campus Wi-Fi. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * CORS origin check shared by REST and Socket.IO. Native clients send no Origin and are always allowed.
 * Production allows only CORS_ORIGINS; development additionally accepts loopback and private-LAN
 * origins on any port so Expo web works via localhost or the machine's LAN IP.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  cfg: Pick<AppConfig, 'CORS_ORIGINS' | 'isProduction'>,
): boolean {
  if (!origin) return true;
  if (cfg.CORS_ORIGINS.includes(origin)) return true;
  if (cfg.isProduction) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return LOOPBACK.has(url.hostname) || isPrivateIpv4(url.hostname);
}
