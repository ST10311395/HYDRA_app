/**
 * One-time bootstrap of the first ADMIN_OWNER account in a fresh (unseeded) environment.
 * Refuses to run if any owner already exists — all later staff are created in-app by the owner.
 *
 *   OWNER_EMAIL=… OWNER_FIRST_NAME=… OWNER_LAST_NAME=… OWNER_PHONE=… OWNER_PASSWORD=… npm run owner:create
 *   (production, from the App Service SSH console: node dist/db/createOwner.js)
 */
import { createStaffSchema } from '@hydra/shared';
import { SYSTEM_ACTOR } from '../services/auditService';
import { createStaff } from '../services/authService';
import { closePool, db } from './pool';

async function main(): Promise<void> {
  const parsed = createStaffSchema.safeParse({
    role: 'ADMIN_OWNER',
    email: process.env.OWNER_EMAIL,
    firstName: process.env.OWNER_FIRST_NAME,
    lastName: process.env.OWNER_LAST_NAME,
    phone: process.env.OWNER_PHONE,
    password: process.env.OWNER_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error(`Invalid owner details: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  const { rows } = await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN_OWNER'`);
  if ((rows[0]?.n ?? 0) > 0) throw new Error('An owner account already exists. Create further staff in the app (More → Staff accounts).');
  const user = await createStaff(parsed.data, { ...SYSTEM_ACTOR, requestId: 'bootstrap-owner' });
  console.log(`Owner account created for ${user.email}. Sign in and change the password from Profile → Security.`);
}

main()
  .catch((err: unknown) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => void closePool());
