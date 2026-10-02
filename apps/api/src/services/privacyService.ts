import { db } from '../db/pool';
import { PostgresUserRepository, toAuthUser } from '../repositories/userRepository';
import type { AuthContext } from '../types/express';
import { businessRule, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { audit, type Actor } from './auditService';
import { withTransaction } from '../db/pool';

/** POPIA §6.4.8 data-subject participation: a structured copy of the caller's own personal data. */
export async function exportMyData(auth: AuthContext, actor: Actor) {
  const q = db();
  const user = await new PostgresUserRepository(q).findById(auth.userId);
  if (!user) throw notFound('User');
  const [consents, jobs, invoices, rewards, notifications] = await Promise.all([
    q.query(`SELECT consent_type AS type, granted, policy_version AS "policyVersion", created_at AS "createdAt" FROM consents WHERE user_id = $1 ORDER BY created_at`, [auth.userId]),
    auth.customerId
      ? q.query(`SELECT reference, status, site_address AS "siteAddress", description, created_at AS "createdAt" FROM jobs WHERE customer_id = $1 ORDER BY created_at`, [auth.customerId])
      : Promise.resolve({ rows: [] }),
    auth.customerId
      ? q.query(`SELECT number, status, total, amount_paid AS "amountPaid", invoice_date AS "invoiceDate" FROM invoices WHERE customer_id = $1 AND status <> 'DRAFT'`, [auth.customerId])
      : Promise.resolve({ rows: [] }),
    auth.customerId
      ? q.query(`SELECT rt.type, rt.points_earned AS "pointsEarned", rt.points_redeemed AS "pointsRedeemed", rt.description, rt.created_at AS "createdAt"
                   FROM rewards_transactions rt JOIN rewards_accounts ra ON ra.id = rt.account_id WHERE ra.customer_id = $1`, [auth.customerId])
      : Promise.resolve({ rows: [] }),
    q.query(`SELECT type, title, created_at AS "createdAt" FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [auth.userId]),
  ]);
  await audit(q, actor, 'PERSONAL_DATA_EXPORTED', 'user', auth.userId);
  return {
    generatedAt: new Date().toISOString(),
    profile: { ...toAuthUser(user), address: user.address, marketingOptIn: user.marketingOptIn },
    consents: consents.rows,
    jobs: jobs.rows,
    invoices: invoices.rows,
    rewardsTransactions: rewards.rows,
    notifications: notifications.rows,
  };
}

export async function listDataRequests(page: number, pageSize: number) {
  const q = db();
  const total = await q.query<{ n: number }>('SELECT count(*)::int AS n FROM data_subject_requests');
  const { rows } = await q.query(
    `SELECT d.id, d.request_type AS type, d.details, d.status, d.resolution, d.created_at AS "createdAt", d.handled_at AS "handledAt",
            u.email, u.role
       FROM data_subject_requests d JOIN users u ON u.id = d.user_id
      ORDER BY (d.status = 'OPEN') DESC, d.created_at DESC LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  return paginated(rows, page, pageSize, total.rows[0]?.n ?? 0);
}

/**
 * Owner resolves a data-subject request. A completed DELETION anonymises the account where legally
 * permitted — financial and compliance records are retained (statutory retention), personal fields are removed.
 */
export async function resolveDataRequest(auth: AuthContext, id: string, status: 'COMPLETED' | 'REJECTED', resolution: string, actor: Actor) {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ userId: string; type: string; status: string }>(
      `SELECT user_id AS "userId", request_type AS type, status FROM data_subject_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const r = rows[0];
    if (!r) throw notFound('Data request');
    if (r.status !== 'OPEN') throw businessRule('This request has already been handled');
    if (r.type === 'DELETION' && status === 'COMPLETED') {
      const target = await new PostgresUserRepository(tx).findById(r.userId);
      if (target && target.role !== 'CUSTOMER') throw businessRule('Staff accounts are deactivated, not anonymised, through the staff management screen');
      const { rows: open } = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM jobs j JOIN customers c ON c.id = j.customer_id
          WHERE c.user_id = $1 AND j.status NOT IN ('PAID','CANCELLED')`,
        [r.userId],
      );
      if ((open[0]?.n ?? 0) > 0) throw businessRule('The customer has open jobs or unpaid invoices; resolve them before anonymising');
      await new PostgresUserRepository(tx).anonymise(r.userId);
    }
    await tx.query(`UPDATE data_subject_requests SET status = $2, resolution = $3, handled_by = $4, handled_at = now() WHERE id = $1`, [id, status, resolution, auth.userId]);
    await audit(tx, actor, `DATA_REQUEST_${status}`, 'data_subject_request', id, { type: r.type });
    return { id, status };
  });
}
