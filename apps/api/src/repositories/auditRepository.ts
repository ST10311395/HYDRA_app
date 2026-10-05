import type { AuditLogDto, ExportLogDto } from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

export interface AuditEntry {
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  ip: string | null;
  metadata?: Record<string, unknown>;
}

export interface IAuditRepository {
  append(entry: AuditEntry): Promise<void>;
  list(f: { action?: string; entityType?: string; actorUserId?: string; search?: string; limit: number; offset: number }): Promise<{ items: AuditLogDto[]; total: number }>;
  recent(limit: number): Promise<AuditLogDto[]>;
  logExport(e: { adminUserId: string; exportType: string; format: string; filters: Record<string, unknown>; rowCount: number }): Promise<string>;
  listExports(limit: number, offset: number): Promise<{ items: ExportLogDto[]; total: number }>;
}

const SELECT = `
  SELECT a.id::text, a.actor_user_id AS "actorUserId",
         NULLIF(TRIM(COALESCE(c.first_name, e.first_name, ad.first_name, '') || ' ' || COALESCE(c.last_name, e.last_name, ad.last_name, '')), '') AS "actorName",
         a.actor_role AS "actorRole", a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
         a.request_id AS "requestId", a.ip, a.metadata, a.created_at AS "createdAt"
    FROM audit_logs a
    LEFT JOIN customers c ON c.user_id = a.actor_user_id
    LEFT JOIN employees e ON e.user_id = a.actor_user_id
    LEFT JOIN admins ad ON ad.user_id = a.actor_user_id`;

export class PostgresAuditRepository implements IAuditRepository {
  constructor(private readonly db: Queryable) {}

  async append(entry: AuditEntry) {
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, request_id, ip, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.actorUserId, entry.actorRole, entry.action, entry.entityType, entry.entityId, entry.requestId, entry.ip, entry.metadata ?? null],
    );
  }

  async list(f: { action?: string; entityType?: string; actorUserId?: string; search?: string; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (f.action) add('a.action = ?', f.action);
    if (f.entityType) add('a.entity_type = ?', f.entityType);
    if (f.actorUserId) add('a.actor_user_id = ?', f.actorUserId);
    if (f.search) {
      params.push(likePattern(f.search));
      where.push(`(a.action ILIKE $${params.length} OR a.entity_id ILIKE $${params.length} OR a.entity_type ILIKE $${params.length})`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs a ${w}`, params);
    params.push(f.limit, f.offset);
    const { rows } = await this.db.query<AuditLogDto>(
      `${SELECT} ${w} ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async recent(limit: number) {
    const { rows } = await this.db.query<AuditLogDto>(`${SELECT} ORDER BY a.created_at DESC, a.id DESC LIMIT $1`, [limit]);
    return rows;
  }

  async logExport(e: { adminUserId: string; exportType: string; format: string; filters: Record<string, unknown>; rowCount: number }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO data_export_logs (admin_user_id, export_type, format, filters, row_count) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [e.adminUserId, e.exportType, e.format, e.filters, e.rowCount],
    );
    return rows[0]!.id;
  }

  async listExports(limit: number, offset: number) {
    const total = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM data_export_logs');
    const { rows } = await this.db.query<ExportLogDto>(
      `SELECT x.id, x.export_type AS "exportType", x.format, x.filters, x.row_count AS "rowCount",
              TRIM(COALESCE(ad.first_name,'') || ' ' || COALESCE(ad.last_name,'')) AS "adminName", x.created_at AS "createdAt"
         FROM data_export_logs x LEFT JOIN admins ad ON ad.user_id = x.admin_user_id
        ORDER BY x.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }
}
