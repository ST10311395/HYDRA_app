import type { Role } from '@hydra/shared';

export interface AuthContext {
  userId: string;
  role: Role;
  customerId: string | null;
  employeeId: string | null;
  adminId: string | null;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
      rawBody?: Buffer;
    }
  }
}

export {};
