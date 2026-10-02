import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from '../routes/define';

let cached: ReturnType<OpenApiGeneratorV3['generateDocument']> | null = null;

/** OpenAPI 3.0 document generated from the same Zod schemas that validate requests. */
export function openApiDocument() {
  if (!cached) {
    cached = new OpenApiGeneratorV3(registry.definitions).generateDocument({
      openapi: '3.0.3',
      info: {
        title: 'HYDRA API',
        version: '1.0.0',
        description:
          'REST API for PSG Electrical and Cables / Trite Solar. JSON over HTTPS, JWT bearer auth, role-based access with ' +
          'server-side ownership checks. Errors use `{ error: { code, message, requestId, details? } }`.',
      },
      servers: [{ url: '/' }],
    });
  }
  return cached;
}
