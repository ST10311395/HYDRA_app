/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type {
  DepartmentContactDto,
  FaqDto,
  OfficeDto,
  PartnerDto,
  PortfolioItemDto,
  ServiceTypeDto,
  ServiceTypeInput,
  TeamMemberDto,
} from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

const PARTNER_LABELS: Record<string, string> = {
  EQUIPMENT_OEM: 'Equipment OEM',
  SOLAR_STORAGE: 'Solar & Storage',
  CABLES_CONDUCTORS: 'Cables & Conductors',
  COMPLIANCE_AUDITING: 'Compliance & Auditing',
  ENTERPRISE_CLIENT: 'Enterprise Client',
};

const SERVICE_COLS = `id, slug, name, category, description, base_price AS "basePrice", sla_text AS "slaText", badge,
  image_key AS "imageKey", specs, features, is_active AS "isActive", display_order AS "displayOrder"`;

export interface IContentRepository {
  listServiceTypes(opts: { activeOnly: boolean; category?: string; search?: string }): Promise<ServiceTypeDto[]>;
  getServiceType(id: string): Promise<ServiceTypeDto | null>;
  getServiceTypeBySlug(slug: string): Promise<ServiceTypeDto | null>;
  createServiceType(input: ServiceTypeInput & { slug: string }): Promise<ServiceTypeDto>;
  updateServiceType(id: string, input: Partial<ServiceTypeInput>): Promise<ServiceTypeDto | null>;
  listPortfolio(opts: { category?: string; search?: string; featuredOnly?: boolean }): Promise<PortfolioItemDto[]>;
  getPortfolioItem(id: string): Promise<PortfolioItemDto | null>;
  listFaqs(category?: string): Promise<FaqDto[]>;
  listPartners(opts: { category?: string; search?: string }): Promise<PartnerDto[]>;
  listTeam(opts: { category?: string; search?: string }): Promise<TeamMemberDto[]>;
  listOffices(): Promise<OfficeDto[]>;
  listDepartments(): Promise<DepartmentContactDto[]>;
}

export class PostgresContentRepository implements IContentRepository {
  constructor(private readonly db: Queryable) {}

  async listServiceTypes(opts: { activeOnly: boolean; category?: string; search?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.activeOnly) where.push('is_active = true');
    if (opts.category) {
      params.push(opts.category);
      where.push(`category = $${params.length}`);
    }
    if (opts.search) {
      params.push(likePattern(opts.search));
      where.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length} OR specs::text ILIKE $${params.length})`);
    }
    const { rows } = await this.db.query<ServiceTypeDto>(
      `SELECT ${SERVICE_COLS} FROM service_types ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY display_order, name`,
      params,
    );
    return rows;
  }

  async getServiceType(id: string) {
    const { rows } = await this.db.query<ServiceTypeDto>(`SELECT ${SERVICE_COLS} FROM service_types WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async getServiceTypeBySlug(slug: string) {
    const { rows } = await this.db.query<ServiceTypeDto>(`SELECT ${SERVICE_COLS} FROM service_types WHERE slug = $1`, [slug]);
    return rows[0] ?? null;
  }

  async createServiceType(input: ServiceTypeInput & { slug: string }) {
    const { rows } = await this.db.query<ServiceTypeDto>(
      `INSERT INTO service_types (slug, name, category, description, base_price, sla_text, badge, is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${SERVICE_COLS}`,
      [input.slug, input.name, input.category, input.description, input.basePrice, input.slaText ?? null, input.badge ?? null, input.isActive, input.displayOrder],
    );
    return rows[0]!;
  }

  async updateServiceType(id: string, input: Partial<ServiceTypeInput>) {
    const map: Record<string, string> = {
      name: 'name', category: 'category', description: 'description', basePrice: 'base_price',
      slaText: 'sla_text', badge: 'badge', isActive: 'is_active', displayOrder: 'display_order',
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
    if (!sets.length) return this.getServiceType(id);
    const { rows } = await this.db.query<ServiceTypeDto>(
      `UPDATE service_types SET ${sets.join(', ')} WHERE id = $1 RETURNING ${SERVICE_COLS}`,
      params,
    );
    return rows[0] ?? null;
  }

  async listPortfolio(opts: { category?: string; search?: string; featuredOnly?: boolean }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.category) {
      params.push(opts.category);
      where.push(`category = $${params.length}`);
    }
    if (opts.featuredOnly) where.push('featured = true');
    if (opts.search) {
      params.push(likePattern(opts.search));
      where.push(`(title ILIKE $${params.length} OR client_name ILIKE $${params.length} OR location ILIKE $${params.length} OR highlights::text ILIKE $${params.length})`);
    }
    const { rows } = await this.db.query<PortfolioItemDto>(
      `SELECT id, title, client_name AS "clientName", location, category, description, image_key AS "imageKey",
              completed_date AS "completedDate", featured, highlights, spec_badge AS "specBadge", accreditation,
              service_type_id AS "serviceTypeId", is_demo AS "isDemo"
         FROM portfolio_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY completed_date DESC`,
      params,
    );
    return rows;
  }

  async getPortfolioItem(id: string) {
    const { rows } = await this.db.query<PortfolioItemDto>(
      `SELECT id, title, client_name AS "clientName", location, category, description, image_key AS "imageKey",
              completed_date AS "completedDate", featured, highlights, spec_badge AS "specBadge", accreditation,
              service_type_id AS "serviceTypeId", is_demo AS "isDemo"
         FROM portfolio_items WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listFaqs(category?: string) {
    const { rows } = await this.db.query<FaqDto>(
      `SELECT id, question, answer, category, display_order AS "displayOrder" FROM faqs
        ${category ? 'WHERE category = $1' : ''} ORDER BY category, display_order`,
      category ? [category] : [],
    );
    return rows;
  }

  async listPartners(opts: { category?: string; search?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.category) {
      params.push(opts.category);
      where.push(`category = $${params.length}`);
    }
    if (opts.search) {
      params.push(likePattern(opts.search));
      where.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length} OR tags::text ILIKE $${params.length} OR certification ILIKE $${params.length})`);
    }
    const { rows } = await this.db.query<Omit<PartnerDto, 'categoryLabel'>>(
      `SELECT id, name, category, established_year AS "establishedYear", description, tags, certification, guarantee,
              logo_key AS "logoKey", is_demo AS "isDemo"
         FROM partners ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY display_order, name`,
      params,
    );
    return rows.map((r) => ({ ...r, categoryLabel: PARTNER_LABELS[r.category] ?? r.category }));
  }

  async listTeam(opts: { category?: string; search?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.category) {
      params.push(opts.category);
      where.push(`category = $${params.length}`);
    }
    if (opts.search) {
      params.push(likePattern(opts.search));
      where.push(`(name ILIKE $${params.length} OR title ILIKE $${params.length} OR skills::text ILIKE $${params.length} OR registration ILIKE $${params.length} OR licence ILIKE $${params.length})`);
    }
    const { rows } = await this.db.query<TeamMemberDto>(
      `SELECT id, name, title, category, rating, registration, licence, skills, experience_years AS "experienceYears",
              projects_count AS "projectsCount", lead_project AS "leadProject", availability, photo_key AS "photoKey", is_demo AS "isDemo"
         FROM team_members ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY display_order, name`,
      params,
    );
    return rows;
  }

  async listOffices() {
    const { rows } = await this.db.query<OfficeDto>(
      `SELECT id, region, name, area, address, phone, email, manager, hours, latitude, longitude FROM offices ORDER BY display_order`,
    );
    return rows;
  }

  async listDepartments() {
    const { rows } = await this.db.query<DepartmentContactDto>(
      `SELECT id, name, email, phone, sla, icon FROM department_contacts ORDER BY display_order`,
    );
    return rows;
  }
}
