#!/usr/bin/env node
/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Static navigation audit: every route literal used in the app (router.push/replace/navigate,
 * <Link href>, `route:` tables, notification deep links) must resolve to an Expo Router file.
 * Exits non-zero on any dead link. Run: `npm run check:routes -w @hydra/mobile`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src', import.meta.url));
const appDir = join(root, 'app');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// 1. File routes → matchers. Groups "(x)" are stripped, "[id]" matches one segment, "index" is the parent.
const routeFiles = walk(appDir).filter((f) => /\.tsx?$/.test(f) && !/(^|[\\/])_layout\.tsx?$/.test(f) && !f.includes('+'));
const routes = routeFiles.map((f) => {
  const segs = relative(appDir, f).replace(/\.tsx?$/, '').split(sep).filter((s) => !/^\(.*\)$/.test(s));
  if (segs[segs.length - 1] === 'index') segs.pop();
  return '/' + segs.join('/');
});
const matchers = routes.map((r) => new RegExp('^' + r.replace(/\[[^\]/]+\]/g, '[^/]+') + '$'));

// 2. Route literals used in source. Template expressions become a placeholder segment.
const patterns = [
  /(?:push|replace|navigate)\(\s*(['"`])(\/[^'"`]*)\1/g,
  /href=\{?\s*(['"`])(\/[^'"`]*)\1/g,
  /route:\s*(['"`])(\/[^'"`]*)\1/g,
  /return\s+(['"`])(\/(?:admin|customer|employee)[^'"`]*)\1/g,
  /=>\s*(['"`])(\/(?:admin|customer|employee)[^'"`]*)\1/g,
];
const problems = [];
let checked = 0;
for (const file of walk(root).filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))) {
  const src = readFileSync(file, 'utf8');
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const raw = m[2];
      const path = raw.replace(/\$\{[^}]+\}/g, 'X').split('?')[0].replace(/\/$/, '') || '/';
      checked += 1;
      if (!matchers.some((rx) => rx.test(path))) problems.push(`${relative(root, file)}: ${raw}`);
    }
  }
}

if (problems.length) {
  console.error(`Dead navigation targets (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✔ ${checked} navigation targets resolve to ${routes.length} file routes.`);
