/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Writes the generated OpenAPI 3 document to docs/openapi.json (used by docs/API.md and CI).
 * Routes register their OpenAPI entries when the router is built, so no database is needed.
 * Usage: npm run openapi -w @hydra/api
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openApiDocument } from '../src/openapi/document';
import { apiRouter } from '../src/routes';

async function main(): Promise<void> {
  // config() is read lazily, so these defaults apply before any route touches it.
  process.env.NODE_ENV ??= 'development';
  process.env.LOG_LEVEL = 'silent';
  apiRouter();
  const doc = openApiDocument();
  const out = path.resolve(__dirname, '../../../docs/openapi.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`OpenAPI ${doc.openapi}: ${Object.keys(doc.paths ?? {}).length} paths → ${path.relative(process.cwd(), out)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
