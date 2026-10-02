import type { LogMaterialsInput, MaterialDto, MaterialInput } from '@hydra/shared';
import { db, type Queryable } from '../db/pool';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresMaterialRepository, type MaterialRow } from '../repositories/materialRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import type { AuthContext } from '../types/express';
import { AppError, badRequest, businessRule, forbidden, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { assertJobAccess, isAdminRole, isOwner } from './accessControl';
import { audit, type Actor } from './auditService';
import { transactional, type EventCollector } from './events';
import { getJobDetail } from './jobService';

async function maybeAlertLowStock(tx: Queryable, events: EventCollector, m: MaterialRow, stockAfter: number): Promise<void> {
  if (stockAfter > m.reorderLevel) return;
  const settings = await new PostgresSettingsRepository(tx).getAll();
  if (!settings.lowStockAlertsEnabled) return;
  // One alert per depletion cycle (reset when restocked above the reorder level).
  if (m.lowStockAlertedAt) return;
  await new PostgresMaterialRepository(tx).markLowStockAlerted(m.id);
  m.lowStockAlertedAt = new Date();
  await events.notifyAdmins({
    type: 'LOW_STOCK',
    title: `Low stock: ${m.name}`,
    body: `${stockAfter} ${m.unit} remaining (reorder level ${m.reorderLevel}).`,
    data: { materialId: m.id, route: '/admin/inventory' },
  });
  events.emit('admins', 'inventory.low_stock', { materialId: m.id, stockAfter });
}

/**
 * Materials logging (PDF Story 8, spec §9.5): a batch of job-material rows and the matching stock
 * decrements happen in ONE transaction with row locks; stock may not go negative without an
 * Owner override (audited). The job's actual materials cost is recalculated immediately.
 */
export async function logMaterials(auth: AuthContext, jobId: string, input: LogMaterialsInput, actor: Actor) {
  if (input.overrideStock && !isOwner(auth)) throw forbidden('Only the owner can authorise a stock override');
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await new PostgresJobRepository(tx).findById(jobId, true));
    if (auth.role === 'CUSTOMER') throw forbidden();
    if (!['IN_PROGRESS', 'INSPECTION_PENDING'].includes(job.status)) {
      throw businessRule('Materials can be logged while the job is in progress', 'JOB_NOT_IN_PROGRESS');
    }
    const materials = new PostgresMaterialRepository(tx);
    const totals = new Map<string, number>();
    for (const item of input.items) totals.set(item.materialId, (totals.get(item.materialId) ?? 0) + item.quantity);
    const locked = await materials.lockMany([...totals.keys()]);
    const byId = new Map(locked.map((m) => [m.id, m]));
    const shortages: { path: string; message: string }[] = [];
    for (const [id, qty] of totals) {
      const m = byId.get(id);
      if (!m || m.isArchived) throw badRequest('One or more materials are not available');
      if (m.stockLevel - qty < 0) shortages.push({ path: id, message: `${m.name}: requested ${qty} ${m.unit}, only ${m.stockLevel} in stock` });
    }
    if (shortages.length && !input.overrideStock) {
      throw new AppError(422, 'INSUFFICIENT_STOCK', 'Not enough stock for one or more materials', shortages);
    }
    for (const item of input.items) {
      const m = byId.get(item.materialId)!;
      const jmId = await materials.insertJobMaterial({
        jobId,
        materialId: m.id,
        quantity: item.quantity,
        costAtTime: m.unitCost,
        notes: item.notes,
        loggedBy: auth.userId,
      });
      const stockAfter = await materials.applyDelta(m.id, -item.quantity);
      await materials.recordMovement({
        materialId: m.id,
        delta: -item.quantity,
        reason: stockAfter < 0 ? 'OVERRIDE' : 'JOB_USAGE',
        stockAfter,
        jobMaterialId: jmId,
        actorUserId: auth.userId,
        note: `${job.reference}${item.notes ? ` — ${item.notes}` : ''}`,
      });
      await maybeAlertLowStock(tx, events, m, stockAfter);
      m.stockLevel = stockAfter;
    }
    const cost = await new PostgresJobRepository(tx).recalcMaterialsCost(jobId);
    events.emit(`job:${jobId}`, 'job.updated', { jobId, status: job.status, event: 'MATERIALS' });
    await audit(tx, actor, shortages.length ? 'MATERIALS_LOGGED_WITH_OVERRIDE' : 'MATERIALS_LOGGED', 'job', jobId, {
      items: input.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity })),
      materialsCost: cost,
    });
  });
  return getJobDetail(auth, jobId);
}

/** Reverses a mis-logged material line (returns stock, audited). */
export async function removeJobMaterial(auth: AuthContext, jobId: string, jobMaterialId: string, actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await new PostgresJobRepository(tx).findById(jobId, true));
    const materials = new PostgresMaterialRepository(tx);
    const jm = await materials.findJobMaterial(jobMaterialId);
    if (!jm || jm.jobId !== jobId) throw notFound('Material entry');
    if (!isAdminRole(auth) && jm.loggedBy !== auth.userId) throw forbidden();
    if (!['IN_PROGRESS', 'INSPECTION_PENDING'].includes(job.status) && !isAdminRole(auth)) {
      throw businessRule('Material entries can only be corrected while the job is active');
    }
    if (['INVOICED', 'PARTIALLY_PAID', 'PAID'].includes(job.status)) throw businessRule('Invoiced jobs cannot be changed');
    await materials.lockMany([jm.materialId]);
    const stockAfter = await materials.applyDelta(jm.materialId, jm.quantityUsed);
    await materials.recordMovement({ materialId: jm.materialId, delta: jm.quantityUsed, reason: 'REVERSAL', stockAfter, actorUserId: auth.userId, note: `Reversal ${job.reference}` });
    await materials.deleteJobMaterial(jobMaterialId);
    await materials.clearLowStockAlert(jm.materialId);
    await new PostgresJobRepository(tx).recalcMaterialsCost(jobId);
    events.emit(`job:${jobId}`, 'job.updated', { jobId, status: job.status, event: 'MATERIALS' });
    await audit(tx, actor, 'MATERIALS_REVERSED', 'job', jobId, { jobMaterialId, quantity: jm.quantityUsed });
  });
  return getJobDetail(auth, jobId);
}

export async function listMaterials(f: { search?: string; lowStockOnly?: boolean; includeArchived?: boolean; page: number; pageSize: number }) {
  const { items, total } = await new PostgresMaterialRepository(db()).list({ ...f, limit: f.pageSize, offset: (f.page - 1) * f.pageSize });
  return paginated(items, f.page, f.pageSize, total);
}

export async function getMaterial(id: string): Promise<MaterialDto> {
  const m = await new PostgresMaterialRepository(db()).dto(id);
  if (!m) throw notFound('Material');
  return m;
}

export async function createMaterial(input: MaterialInput, actor: Actor): Promise<MaterialDto> {
  const id = await transactional(async (tx) => {
    const materials = new PostgresMaterialRepository(tx);
    const newId = await materials.create({ ...input, stockLevel: 0 });
    if (input.stockLevel > 0) {
      const stockAfter = await materials.applyDelta(newId, input.stockLevel);
      await materials.recordMovement({ materialId: newId, delta: input.stockLevel, reason: 'RESTOCK', stockAfter, actorUserId: actor.userId!, note: 'Opening stock' });
    }
    await audit(tx, actor, 'MATERIAL_CREATED', 'material', newId, { sku: input.sku, openingStock: input.stockLevel });
    return newId;
  });
  return (await new PostgresMaterialRepository(db()).dto(id))!;
}

export async function updateMaterial(id: string, input: Partial<MaterialInput>, actor: Actor): Promise<MaterialDto> {
  await transactional(async (tx) => {
    if (!(await new PostgresMaterialRepository(tx).update(id, input))) throw notFound('Material');
    await audit(tx, actor, 'MATERIAL_UPDATED', 'material', id, { fields: Object.keys(input) });
  });
  return (await new PostgresMaterialRepository(db()).dto(id))!;
}

export async function setMaterialArchived(id: string, archived: boolean, actor: Actor): Promise<MaterialDto> {
  await transactional(async (tx) => {
    if (!(await new PostgresMaterialRepository(tx).setArchived(id, archived))) throw notFound('Material');
    await audit(tx, actor, archived ? 'MATERIAL_ARCHIVED' : 'MATERIAL_RESTORED', 'material', id);
  });
  return (await new PostgresMaterialRepository(db()).dto(id))!;
}

/** Stock adjustments are auditable movements (spec §10.6); negative results need an Owner. */
export async function adjustStock(auth: AuthContext, id: string, delta: number, reason: 'RESTOCK' | 'ADJUSTMENT', note: string, actor: Actor): Promise<MaterialDto> {
  if (reason === 'RESTOCK' && delta <= 0) throw badRequest('A restock must increase stock');
  await transactional(async (tx, events) => {
    const materials = new PostgresMaterialRepository(tx);
    const [m] = await materials.lockMany([id]);
    if (!m) throw notFound('Material');
    if (m.stockLevel + delta < 0 && !isOwner(auth)) {
      throw businessRule('Adjustment would make stock negative. Owner authorisation is required.', 'INSUFFICIENT_STOCK');
    }
    const stockAfter = await materials.applyDelta(id, delta);
    await materials.recordMovement({ materialId: id, delta, reason: stockAfter < 0 ? 'OVERRIDE' : reason, stockAfter, actorUserId: auth.userId, note });
    if (stockAfter > m.reorderLevel) await materials.clearLowStockAlert(id);
    else await maybeAlertLowStock(tx, events, m, stockAfter);
    await audit(tx, actor, 'STOCK_ADJUSTED', 'material', id, { delta, reason, stockAfter, note });
  });
  return (await new PostgresMaterialRepository(db()).dto(id))!;
}

export async function stockMovements(materialId: string | undefined, page: number, pageSize: number) {
  const { items, total } = await new PostgresMaterialRepository(db()).movements({ materialId, limit: pageSize, offset: (page - 1) * pageSize });
  return paginated(items, page, pageSize, total);
}
