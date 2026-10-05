/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
import type { Paginated } from '@hydra/shared';

export function pageParams(page: number, pageSize: number): { limit: number; offset: number } {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function paginated<T>(items: T[], page: number, pageSize: number, total: number): Paginated<T> {
  return { items, page, pageSize, total };
}

/** Escapes LIKE wildcards in user search input (used with parameterised ILIKE). */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
