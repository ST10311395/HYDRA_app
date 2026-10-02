#!/usr/bin/env node
/**
 * Points local development at this machine's LAN IP so a physical phone on the same Wi-Fi can reach
 * the API. Updates only these keys and keeps everything else (including secrets) untouched:
 *   apps/mobile/.env  EXPO_PUBLIC_API_URL=http://<ip>:4000
 *   apps/api/.env     HOST=0.0.0.0, PUBLIC_API_BASE_URL=http://<ip>:4000 (signed file + sandbox checkout links)
 * Usage: npm run lan            (auto-detect)
 *        npm run lan -- 192.168.1.20
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4000;
const VIRTUAL =
  /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Bluetooth|Loopback|utun|bridge|veth/i;

function detect() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      candidates.push({
        name,
        address: a.address,
        score: (VIRTUAL.test(name) ? 0 : 2) + (/wi-?fi|wlan|en0/i.test(name) ? 1 : 0),
      });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return { chosen: candidates[0], candidates };
}

function upsert(file, values) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else
      lines.splice(
        lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length,
        0,
        `${key}=${value}`,
      );
  }
  writeFileSync(file, `${lines.join('\n').replace(/\n*$/, '')}\n`);
}

const arg = process.argv[2];
const { chosen, candidates } = detect();
const ip = arg ?? chosen?.address;
if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
  console.error(
    'Could not determine a LAN IPv4 address. Pass one explicitly: npm run lan -- 192.168.1.20',
  );
  process.exit(1);
}
const url = `http://${ip}:${PORT}`;
upsert(join(root, 'apps/mobile/.env'), { EXPO_PUBLIC_API_URL: url });
upsert(join(root, 'apps/api/.env'), { HOST: '0.0.0.0', PUBLIC_API_BASE_URL: url });

console.log(`LAN API URL: ${url}`);
if (!arg && candidates.length > 1) {
  console.log(
    `Other addresses: ${candidates
      .filter((c) => c !== chosen)
      .map((c) => `${c.address} (${c.name})`)
      .join(', ')}`,
  );
}
console.log(
  'Updated apps/mobile/.env and apps/api/.env — restart the API and Expo (expo start --clear) to apply.',
);
