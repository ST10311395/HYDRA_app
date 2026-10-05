/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { JobMaterialDto, MaterialDto, MaterialInput, StockMovementDto, StockMovementReason } from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

export interface MaterialRow {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  stockLevel: number;
  reorderLevel: number;
  isArchived: boolean;
  lowStockAlertedAt: Date | null;
}

const DTO_COLS = `id, sku, name, unit, unit_cost AS "unitCost", stock_level AS "stockLevel", reorder_level AS "reorderLevel",
  (stock_level <= reorder_level) AS "isLowStock", supplier_name AS "supplierName", supplier_contact AS "supplierContact",
  is_archived AS "isArchived", updated_at AS "updatedAt"`;

export interface IMaterialRepository {
  list(f: { search?: string; lowStockOnly?: boolean; includeArchived?: boolean; limit: number; offset: number }): Promise<{ items: MaterialDto[]; total: number }>;
  dto(id: string): Promise<MaterialDto | null>;
  lockMany(ids: string[]): Promise<MaterialRow[]>;
  create(input: MaterialInput): Promise<string>;
  update(id: string, input: Partial<MaterialInput>): Promise<boolean>;
  setArchived(id: string, archived: boolean): Promise<boolean>;
  applyDelta(id: string, delta: number): Promise<number>;
  markLowStockAlerted(id: string): Promise<void>;
  clearLowStockAlert(id: string): Promise<void>;
  recordMovement(m: { materialId: string; delta: number; reason: StockMovementReason; stockAfter: number; jobMaterialId?: string | null; actorUserId: string; note?: string | null }): Promise<void>;
  movements(f: { materialId?: string; limit: number; offset: number }): Promise<{ items: StockMovementDto[]; total: number }>;
  insertJobMaterial(jm: { jobId: string; materialId: string; quantity: number; costAtTime: number; notes?: string; loggedBy: string }): Promise<string>;
  findJobMaterial(id: string): Promise<{ id: string; jobId: string; materialId: string; quantityUsed: number; loggedBy: string } | null>;
  deleteJobMaterial(id: string): Promise<void>;
  jobMaterials(jobId: string): Promise<JobMaterialDto[]>;
  lowStockCount(): Promise<number>;
}

export class PostgresMaterialRepository implements IMaterialRepository {
  constructor(private readonly db: Queryable) {}

  async list(f: { search?: string; lowStockOnly?: boolean; includeArchived?: boolean; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (!f.includeArchived) where.push('is_archived = false');
    if (f.lowStockOnly) where.push('stock_level <= reorder_level');
    if (f.search) {
      params.push(likePattern(f.search));
      where.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length} OR supplier_name ILIKE $${params.length})`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM materials ${w}`, params);
    const { rows } = await this.db.query<MaterialDto>(
      `SELECT ${DTO_COLS} FROM materials ${w} ORDER BY (stock_level <= reorder_level) DESC, name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async dto(id: string) {
    const { rows } = await this.db.query<MaterialDto>(`SELECT ${DTO_COLS} FROM materials WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Row-locks materials in a deterministic order (by id) to avoid deadlocks between concurrent batches. */
  async lockMany(ids: string[]) {
    const { rows } = await this.db.query<MaterialRow>(
      `SELECT id, name, unit, unit_cost AS "unitCost", stock_level AS "stockLevel", reorder_level AS "reorderLevel",
              is_archived AS "isArchived", low_stock_alerted_at AS "lowStockAlertedAt"
         FROM materials WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [ids],
    );
    return rows;
  }

  async create(input: MaterialInput) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO materials (sku, name, unit, unit_cost, stock_level, reorder_level, supplier_name, supplier_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [input.sku, input.name, input.unit, input.unitCost, input.stockLevel, input.reorderLevel, input.supplierName ?? null, input.supplierContact ?? null],
    );
    return rows[0]!.id;
  }

  async update(id: string, input: Partial<MaterialInput>) {
    const map: Record<string, string> = {
      sku: 'sku', name: 'name', unit: 'unit', unitCost: 'unit_cost', reorderLevel: 'reorder_level',
      supplierName: 'supplier_name', supplierContact: 'supplier_contact',
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [k, col] of Object.entries(map)) {
      const v = (input as Record<string, unknown>)[k];
      if (v !== undefined) {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return true;
    const r = await this.db.query(`UPDATE materials SET ${sets.join(', ')} WHERE id = $1`, params);
    return (r.rowCount ?? 0) === 1;
  }

  async setArchived(id: string, archived: boolean) {
    const r = await this.db.query('UPDATE materials SET is_archived = $2 WHERE id = $1', [id, archived]);
    return (r.rowCount ?? 0) === 1;
  }

  async applyDelta(id: string, delta: number) {
    const { rows } = await this.db.query<{ stock: number }>(
      'UPDATE materials SET stock_level = stock_level + $2 WHERE id = $1 RETURNING stock_level AS stock',
      [id, delta],
    );
    return rows[0]!.stock;
  }

  async markLowStockAlerted(id: string) {
    await this.db.query('UPDATE materials SET low_stock_alerted_at = now() WHERE id = $1', [id]);
  }

  async clearLowStockAlert(id: string) {
    await this.db.query('UPDATE materials SET low_stock_alerted_at = NULL WHERE id = $1 AND stock_level > reorder_level', [id]);
  }

  async recordMovement(m: { materialId: string; delta: number; reason: StockMovementReason; stockAfter: number; jobMaterialId?: string | null; actorUserId: string; note?: string | null }) {
    await this.db.query(
      `INSERT INTO stock_movements (material_id, delta, reason, stock_after, job_material_id, actor_user_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [m.materialId, m.delta, m.reason, m.stockAfter, m.jobMaterialId ?? null, m.actorUserId, m.note ?? null],
    );
  }

  async movements(f: { materialId?: string; limit: number; offset: number }) {
    const w = f.materialId ? 'WHERE sm.material_id = $1' : '';
    const params: unknown[] = f.materialId ? [f.materialId] : [];
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM stock_movements sm ${w}`, params);
    const { rows } = await this.db.query<StockMovementDto>(
      `SELECT sm.id, sm.material_id AS "materialId", m.name AS "materialName", sm.delta, sm.reason, sm.stock_after AS "stockAfter",
              j.reference AS "jobReference",
              TRIM(COALESCE(e.first_name, a.first_name, '') || ' ' || COALESCE(e.last_name, a.last_name, '')) AS "actorName",
              sm.note, sm.created_at AS "createdAt"
         FROM stock_movements sm
         JOIN materials m ON m.id = sm.material_id
         LEFT JOIN job_materials jm ON jm.id = sm.job_material_id
         LEFT JOIN jobs j ON j.id = jm.job_id
         LEFT JOIN employees e ON e.user_id = sm.actor_user_id
         LEFT JOIN admins a ON a.user_id = sm.actor_user_id
         ${w} ORDER BY sm.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async insertJobMaterial(jm: { jobId: string; materialId: string; quantity: number; costAtTime: number; notes?: string; loggedBy: string }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO job_materials (job_id, material_id, quantity_used, cost_at_time, notes, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [jm.jobId, jm.materialId, jm.quantity, jm.costAtTime, jm.notes ?? null, jm.loggedBy],
    );
    return rows[0]!.id;
  }

  async findJobMaterial(id: string) {
    const { rows } = await this.db.query<{ id: string; jobId: string; materialId: string; quantityUsed: number; loggedBy: string }>(
      `SELECT id, job_id AS "jobId", material_id AS "materialId", quantity_used AS "quantityUsed", logged_by AS "loggedBy"
         FROM job_materials WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async deleteJobMaterial(id: string) {
    await this.db.query('DELETE FROM job_materials WHERE id = $1', [id]);
  }

  async jobMaterials(jobId: string) {
    const { rows } = await this.db.query<JobMaterialDto>(
      `SELECT jm.id, jm.material_id AS "materialId", m.name AS "materialName", m.unit, jm.quantity_used AS "quantityUsed",
              jm.cost_at_time AS "costAtTime", ROUND(jm.quantity_used * jm.cost_at_time, 2)::float8 AS "lineCost", jm.notes,
              TRIM(COALESCE(e.first_name, a.first_name, '') || ' ' || COALESCE(e.last_name, a.last_name, '')) AS "loggedByName",
              jm.created_at AS "createdAt"
         FROM job_materials jm JOIN materials m ON m.id = jm.material_id
         LEFT JOIN employees e ON e.user_id = jm.logged_by LEFT JOIN admins a ON a.user_id = jm.logged_by
        WHERE jm.job_id = $1 ORDER BY jm.created_at`,
      [jobId],
    );
    return rows;
  }

  async lowStockCount() {
    const { rows } = await this.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM materials WHERE is_archived = false AND stock_level <= reorder_level',
    );
    return rows[0]?.n ?? 0;
  }
}
