/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
/** `npm run db:seed:ai` — adds Smart Quote defaults to an existing database (no reset, idempotent). */
import { closePool } from '../src/db/pool';
import { seedSmartQuote } from './ai';

seedSmartQuote()
  .then(async () => {
    await closePool();
    console.log('HYDRA Smart Quote seed complete.');
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
