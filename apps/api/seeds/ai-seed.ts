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
