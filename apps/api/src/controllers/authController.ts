/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { Request, Router } from 'express';
import { z } from 'zod';
import {
  changePasswordSchema,
  dataRequestSchema,
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  logoutSchema,
  pushTokenSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@hydra/shared';
import { db } from '../db/pool';
import { actorFrom, auth } from '../middleware/auth';
import { loginLimiter, passwordResetLimiter, registerLimiter } from '../middleware/rateLimits';
import { PostgresNotificationRepository } from '../repositories/notificationRepository';
import { defineRoute } from '../routes/define';
import { audit } from '../services/auditService';
import * as authService from '../services/authService';
import { exportMyData } from '../services/privacyService';

const meta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null });

export function registerAuthRoutes(r: Router): void {
  defineRoute(r, { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Register a customer account', access: 'public', body: registerSchema, status: 201, pre: [registerLimiter] },
    (req, { body }) => authService.registerCustomer(body, actorFrom(req), meta(req)));

  defineRoute(r, { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Sign in with email (customer/admin) or staff number (employee) + password', access: 'public', body: loginSchema, pre: [loginLimiter] },
    (req, { body }) => authService.login(body, actorFrom(req), meta(req)));

  defineRoute(r, { method: 'post', path: '/auth/google', tag: 'Auth', summary: 'Sign in with a Google ID token (verified server-side)', access: 'public', body: googleLoginSchema, pre: [loginLimiter] },
    (req, { body }) => authService.googleLogin(body, actorFrom(req), meta(req)));

  defineRoute(r, { method: 'post', path: '/auth/google/link', tag: 'Auth', summary: 'Link a Google identity to the signed-in account', access: 'authenticated', body: z.object({ idToken: z.string().min(20).max(4096) }) },
    async (req, { body }) => {
      await authService.linkGoogle(auth(req).userId, body.idToken, actorFrom(req));
      return authService.getMe(auth(req).userId);
    });

  defineRoute(r, { method: 'post', path: '/auth/refresh', tag: 'Auth', summary: 'Rotate refresh token and issue a new access token', access: 'public', body: refreshSchema, pre: [loginLimiter] },
    (req, { body }) => authService.refreshSession(body.refreshToken, actorFrom(req), meta(req)));

  defineRoute(r, { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Revoke the current session', access: 'optional', body: logoutSchema },
    async (req, { body }) => {
      await authService.logout(req.auth ? { userId: req.auth.userId, sessionId: req.auth.sessionId } : undefined, body.refreshToken, actorFrom(req));
    });

  defineRoute(r, { method: 'post', path: '/auth/forgot-password', tag: 'Auth', summary: 'Request a password reset link (always 202)', access: 'public', body: forgotPasswordSchema, status: 202, pre: [passwordResetLimiter] },
    async (req, { body }) => {
      await authService.forgotPassword(body.email, actorFrom(req));
      return { message: 'If an account exists for this email, a reset link has been sent.' };
    });

  defineRoute(r, { method: 'post', path: '/auth/reset-password', tag: 'Auth', summary: 'Reset password with a single-use token', access: 'public', body: resetPasswordSchema, pre: [passwordResetLimiter] },
    async (req, { body }) => {
      await authService.resetPassword(body.token, body.password, actorFrom(req));
      return { message: 'Password updated. Please sign in.' };
    });

  defineRoute(r, { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Current user', access: 'authenticated' },
    (req) => authService.getMe(auth(req).userId));

  defineRoute(r, { method: 'post', path: '/auth/change-password', tag: 'Auth', summary: 'Change password (revokes all sessions)', access: 'authenticated', body: changePasswordSchema, pre: [passwordResetLimiter] },
    async (req, { body }) => {
      await authService.changePassword(auth(req).userId, body.currentPassword, body.newPassword, actorFrom(req));
      return { message: 'Password changed. Please sign in again.' };
    });

  // ---- Profile -------------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/profile', tag: 'Profile', summary: 'My profile', access: 'authenticated' },
    (req) => authService.getMe(auth(req).userId));

  defineRoute(r, { method: 'patch', path: '/profile', tag: 'Profile', summary: 'Correct my profile details (POPIA information quality)', access: 'authenticated', body: updateProfileSchema },
    (req, { body }) => authService.updateProfile(auth(req).userId, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/profile/onboarding-complete', tag: 'Profile', summary: 'Mark guided walkthrough as completed (PDF Story 23)', access: 'authenticated' },
    (req) => authService.completeOnboarding(auth(req).userId));

  defineRoute(r, { method: 'post', path: '/profile/push-tokens', tag: 'Profile', summary: 'Register an Expo push token for this device', access: 'authenticated', body: pushTokenSchema, status: 201 },
    async (req, { body }) => {
      await new PostgresNotificationRepository(db()).savePushToken(auth(req).userId, body.token, body.platform);
      return { registered: true };
    });

  defineRoute(r, { method: 'delete', path: '/profile/push-tokens', tag: 'Profile', summary: 'Unregister a push token', access: 'authenticated', body: z.object({ token: z.string().min(10).max(256) }) },
    async (req, { body }) => {
      await new PostgresNotificationRepository(db()).deletePushToken(auth(req).userId, body.token);
    });

  defineRoute(r, { method: 'post', path: '/profile/data-requests', tag: 'Profile', summary: 'Submit a POPIA data-subject request (access / correction / deletion)', access: 'authenticated', body: dataRequestSchema, status: 201, idempotent: true },
    async (req, { body }) => {
      const { rows } = await db().query<{ id: string; createdAt: string }>(
        `INSERT INTO data_subject_requests (user_id, request_type, details) VALUES ($1,$2,$3) RETURNING id, created_at AS "createdAt"`,
        [auth(req).userId, body.type, body.details ?? null],
      );
      await audit(db(), actorFrom(req), 'DATA_SUBJECT_REQUEST', 'data_subject_request', rows[0]!.id, { type: body.type });
      return { id: rows[0]!.id, status: 'OPEN', createdAt: rows[0]!.createdAt };
    });

  defineRoute(r, { method: 'get', path: '/profile/data-export', tag: 'Profile', summary: 'Download a copy of my personal data (POPIA access right)', access: 'authenticated' },
    (req) => exportMyData(auth(req), actorFrom(req)));
}
