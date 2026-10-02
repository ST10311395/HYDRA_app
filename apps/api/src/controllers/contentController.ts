import type { Router } from 'express';
import { z } from 'zod';
import {
  PARTNER_CATEGORIES,
  PORTFOLIO_CATEGORIES,
  SERVICE_CATEGORIES,
  TEAM_CATEGORIES,
  idParam,
  optionalText,
  serviceTypeSchema,
  type PublicContentDto,
} from '@hydra/shared';
import { db } from '../db/pool';
import { actorFrom } from '../middleware/auth';
import { PostgresContentRepository } from '../repositories/contentRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import { defineRoute } from '../routes/define';
import { audit } from '../services/auditService';
import { notFound } from '../utils/errors';
import { paymentMode } from '../integrations/payments';

const repo = () => new PostgresContentRepository(db());

const FALLBACK_CONTENT: PublicContentDto = {
  company: { name: 'PSG Electrical & Cables', tagline: 'Electrical & Solar', hotline: '', emergencyLine: '', whatsapp: '', email: '', established: 2008 },
  metrics: [],
  accreditations: [],
  certifications: [],
  testimonial: null,
  isDemoContent: true,
};

/** Public marketing content (PDF Story 22) — readable without login, write access admin-only. */
export function registerContentRoutes(r: Router): void {
  defineRoute(r, { method: 'get', path: '/public-content', tag: 'Content', summary: 'Company details, metrics, accreditations and testimonial', access: 'public' },
    async (): Promise<PublicContentDto> => ({ ...((await new PostgresSettingsRepository(db()).getJson<PublicContentDto>('publicContent')) ?? FALLBACK_CONTENT), paymentMode: paymentMode() }));

  defineRoute(r, { method: 'get', path: '/service-types', tag: 'Content', summary: 'Service catalogue', access: 'optional',
    query: z.object({ category: z.enum(SERVICE_CATEGORIES).optional(), search: optionalText(100), includeInactive: z.enum(['true', 'false']).optional() }) },
    (req, { query }) => {
      const admin = req.auth && ['ADMIN_OFFICE', 'ADMIN_OWNER'].includes(req.auth.role);
      return repo().listServiceTypes({ activeOnly: !(admin && query.includeInactive === 'true'), category: query.category, search: query.search });
    });

  defineRoute(r, { method: 'get', path: '/service-types/:id', tag: 'Content', summary: 'Service detail', access: 'public', params: idParam },
    async (_req, { params }) => (await repo().getServiceType(params.id)) ?? Promise.reject(notFound('Service')));

  defineRoute(r, { method: 'post', path: '/service-types', tag: 'Content', summary: 'Create a structured service type', access: ['ADMIN_OFFICE', 'ADMIN_OWNER'], body: serviceTypeSchema, status: 201 },
    async (req, { body }) => {
      const slug = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
      const created = await repo().createServiceType({ ...body, slug });
      await audit(db(), actorFrom(req), 'SERVICE_TYPE_CREATED', 'service_type', created.id, { name: body.name });
      return created;
    });

  defineRoute(r, { method: 'patch', path: '/service-types/:id', tag: 'Content', summary: 'Update a service type', access: ['ADMIN_OFFICE', 'ADMIN_OWNER'], params: idParam, body: serviceTypeSchema.partial() },
    async (req, { params, body }) => {
      const updated = await repo().updateServiceType(params.id, body);
      if (!updated) throw notFound('Service');
      await audit(db(), actorFrom(req), 'SERVICE_TYPE_UPDATED', 'service_type', params.id, { fields: Object.keys(body) });
      return updated;
    });

  defineRoute(r, { method: 'get', path: '/portfolio', tag: 'Content', summary: 'Recent work / case studies', access: 'public',
    query: z.object({ category: z.enum(PORTFOLIO_CATEGORIES).optional(), search: optionalText(100), featured: z.enum(['true', 'false']).optional() }) },
    (_req, { query }) => repo().listPortfolio({ category: query.category, search: query.search, featuredOnly: query.featured === 'true' }));

  defineRoute(r, { method: 'get', path: '/portfolio/:id', tag: 'Content', summary: 'Case study detail', access: 'public', params: idParam },
    async (_req, { params }) => (await repo().getPortfolioItem(params.id)) ?? Promise.reject(notFound('Project')));

  defineRoute(r, { method: 'get', path: '/faqs', tag: 'Content', summary: 'FAQs', access: 'public', query: z.object({ category: optionalText(40) }) },
    (_req, { query }) => repo().listFaqs(query.category));

  defineRoute(r, { method: 'get', path: '/partners', tag: 'Content', summary: 'Partner directory', access: 'public',
    query: z.object({ category: z.enum(PARTNER_CATEGORIES).optional(), search: optionalText(100) }) },
    (_req, { query }) => repo().listPartners(query));

  defineRoute(r, { method: 'get', path: '/team', tag: 'Content', summary: 'Team profiles', access: 'public',
    query: z.object({ category: z.enum(TEAM_CATEGORIES).optional(), search: optionalText(100) }) },
    (_req, { query }) => repo().listTeam(query));

  defineRoute(r, { method: 'get', path: '/offices', tag: 'Content', summary: 'Regional offices', access: 'public' },
    () => repo().listOffices());

  defineRoute(r, { method: 'get', path: '/departments', tag: 'Content', summary: 'Department direct contacts', access: 'public' },
    () => repo().listDepartments());
}
