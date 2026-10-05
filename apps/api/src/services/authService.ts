/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type {
  AuthSession,
  CreateStaffInput,
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '@hydra/shared';
import { SELF_EDITABLE_FIELDS } from '@hydra/shared';
import { config } from '../config/env';
import { db, withTransaction, type Queryable } from '../db/pool';
import { integrations } from '../integrations';
import { PostgresSessionRepository } from '../repositories/sessionRepository';
import { PostgresUserRepository, toAuthUser, type UserRecord } from '../repositories/userRepository';
import { randomToken, sha256 } from '../utils/crypto';
import { AppError, businessRule, conflict, forbidden, notFound, tooMany, unauthorized, validationError } from '../utils/errors';
import { audit, type Actor } from './auditService';
import { hashRefreshToken, newRefreshToken, signAccessToken } from './tokenService';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const IDENTIFIER_FAILURE_LIMIT = 10;
const RESET_TOKEN_TTL_MINUTES = 30;
// Hash compared against when an account does not exist, equalising timing (anti-enumeration).
let dummyHash: string | null = null;
function timingHash(): string {
  dummyHash ??= bcrypt.hashSync(randomToken(12), config().BCRYPT_COST);
  return dummyHash;
}

interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config().BCRYPT_COST);
}

async function issueSession(q: Queryable, user: UserRecord, meta: ClientMeta, familyId: string = randomUUID()): Promise<AuthSession> {
  const refresh = newRefreshToken();
  await new PostgresSessionRepository(q).createRefreshToken({
    userId: user.id,
    familyId,
    hash: refresh.hash,
    expiresAt: refresh.expiresAt,
    userAgent: meta.userAgent ?? undefined,
    ip: meta.ip ?? undefined,
  });
  const access = await signAccessToken({
    sub: user.id,
    role: user.role,
    cid: user.customerId,
    eid: user.employeeId,
    aid: user.adminId,
    sid: familyId,
    tv: user.tokenVersion,
  });
  return {
    user: toAuthUser(user),
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
  };
}

export async function registerCustomer(input: RegisterInput, actor: Actor, meta: ClientMeta): Promise<AuthSession> {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (tx) => {
    const users = new PostgresUserRepository(tx);
    if (await users.findByEmail(input.email)) {
      // Registration necessarily reveals that an email is taken; the message stays neutral.
      throw conflict('An account with this email already exists. Try signing in or resetting your password.', 'EMAIL_IN_USE');
    }
    const userId = await users.create({ email: input.email, passwordHash, role: 'CUSTOMER' });
    await users.createCustomerProfile(userId, {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      address: input.address ?? null,
      marketingOptIn: input.marketingOptIn,
    });
    await users.recordConsent(userId, 'PRIVACY_POLICY', true);
    await users.recordConsent(userId, 'MARKETING', input.marketingOptIn);
    await audit(tx, { ...actor, userId }, 'AUTH_REGISTER', 'user', userId, { method: 'password' });
    const user = (await users.findById(userId))!;
    return issueSession(tx, user, meta);
  });
}

export async function login(input: LoginInput, actor: Actor, meta: ClientMeta): Promise<AuthSession> {
  const sessions = new PostgresSessionRepository(db());
  const users = new PostgresUserRepository(db());
  const identifier = input.identifier.trim();

  if ((await sessions.recentFailures(identifier, LOCKOUT_MINUTES)) >= IDENTIFIER_FAILURE_LIMIT) {
    await audit(db(), actor, 'AUTH_LOGIN_THROTTLED', 'user', null, { identifier: identifier.slice(0, 3) + '***' });
    throw tooMany('Too many sign-in attempts. Please wait 15 minutes and try again.');
  }

  const user = identifier.includes('@') ? await users.findByEmail(identifier) : await users.findByStaffNumber(identifier);
  const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? timingHash());
  const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();

  if (!user || !user.passwordHash || !passwordOk || locked || user.status !== 'ACTIVE') {
    await sessions.recordLoginAttempt(identifier, meta.ip, false);
    if (user && !locked && user.passwordHash && !passwordOk) {
      const failures = user.failedLoginCount + 1;
      const lockUntil = failures >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
      await users.recordFailedLogin(user.id, lockUntil);
      if (lockUntil) await audit(db(), { ...actor, userId: user.id }, 'AUTH_ACCOUNT_LOCKED', 'user', user.id, { minutes: LOCKOUT_MINUTES });
    }
    await audit(db(), { ...actor, userId: user?.id ?? null }, 'AUTH_LOGIN_FAILED', 'user', user?.id ?? null, {
      reason: !user ? 'unknown_identifier' : locked ? 'locked' : user.status !== 'ACTIVE' ? 'disabled' : 'bad_password',
    });
    // Identical response for every failure path — no account enumeration.
    throw unauthorized('Incorrect email/staff number or password, or the account is temporarily locked.');
  }

  return withTransaction(async (tx) => {
    const txUsers = new PostgresUserRepository(tx);
    await txUsers.recordSuccessfulLogin(user.id);
    await new PostgresSessionRepository(tx).recordLoginAttempt(identifier, meta.ip, true);
    await audit(tx, { ...actor, userId: user.id, role: user.role }, 'AUTH_LOGIN', 'user', user.id, { method: 'password' });
    return issueSession(tx, (await txUsers.findById(user.id))!, meta);
  });
}

/**
 * Google Sign-In. The ID token is verified server-side; the client-sent role is never trusted.
 * - Known Google subject → sign in to the linked HYDRA account.
 * - Unknown subject + existing HYDRA account with that email → refuse; the owner must link Google
 *   while signed in (prevents duplicate-account takeover). Staff accounts can only be linked this way.
 * - Unknown subject + no account → create a CUSTOMER after explicit privacy consent.
 */
export async function googleLogin(input: GoogleLoginInput, actor: Actor, meta: ClientMeta): Promise<AuthSession> {
  const identity = await integrations().google.verify(input.idToken);
  if (!identity.emailVerified) throw unauthorized('Your Google account email is not verified');
  return withTransaction(async (tx) => {
    const users = new PostgresUserRepository(tx);
    const linked = await users.findByIdentity('google', identity.subject);
    if (linked) {
      if (linked.status !== 'ACTIVE') throw unauthorized('This account is disabled. Contact PSG Electrical support.');
      await users.touchIdentity('google', identity.subject);
      await users.recordSuccessfulLogin(linked.id);
      await audit(tx, { ...actor, userId: linked.id, role: linked.role }, 'AUTH_LOGIN', 'user', linked.id, { method: 'google' });
      return issueSession(tx, linked, meta);
    }
    const existing = await users.findByEmail(identity.email);
    if (existing) {
      await audit(tx, { ...actor, userId: existing.id }, 'AUTH_GOOGLE_LINK_REQUIRED', 'user', existing.id, { role: existing.role });
      if (existing.role !== 'CUSTOMER') {
        throw forbidden('Google sign-in is not linked to this staff account. Sign in with your staff credentials and link Google from your profile.');
      }
      throw conflict('An account already exists for this email. Sign in with your password, then link Google from your profile.', 'GOOGLE_LINK_REQUIRED');
    }
    if (input.acceptPrivacyPolicy !== true) {
      throw new AppError(428, 'CONSENT_REQUIRED', 'Please accept the privacy notice to create your HYDRA account');
    }
    const userId = await users.create({ email: identity.email, passwordHash: null, role: 'CUSTOMER' });
    await users.createCustomerProfile(userId, {
      firstName: identity.givenName ?? 'Customer',
      lastName: identity.familyName ?? '',
      phone: input.phone ?? null,
      address: null,
      marketingOptIn: false,
    });
    await users.linkIdentity(userId, 'google', identity.subject, identity.email, identity.emailVerified);
    await users.recordConsent(userId, 'PRIVACY_POLICY', true);
    await users.recordSuccessfulLogin(userId);
    await audit(tx, { ...actor, userId, role: 'CUSTOMER' }, 'AUTH_REGISTER', 'user', userId, { method: 'google' });
    return issueSession(tx, (await users.findById(userId))!, meta);
  });
}

/** Links a verified Google identity to the signed-in account (customers and authorised staff). */
export async function linkGoogle(userId: string, idToken: string, actor: Actor): Promise<void> {
  const identity = await integrations().google.verify(idToken);
  if (!identity.emailVerified) throw unauthorized('Your Google account email is not verified');
  await withTransaction(async (tx) => {
    const users = new PostgresUserRepository(tx);
    const other = await users.findByIdentity('google', identity.subject);
    if (other && other.id !== userId) throw conflict('This Google account is already linked to another HYDRA account');
    const me = await users.findById(userId);
    if (!me) throw unauthorized();
    if (me.hasGoogleLink) throw conflict('A Google account is already linked');
    if (me.role !== 'CUSTOMER' && identity.email !== me.email.toLowerCase()) {
      throw forbidden('Staff accounts can only be linked to the Google account matching their work email');
    }
    await users.linkIdentity(userId, 'google', identity.subject, identity.email, true);
    await audit(tx, actor, 'AUTH_GOOGLE_LINKED', 'user', userId, { email: identity.email });
  });
}

/** Rotating refresh: each refresh token is single-use; presenting a rotated token revokes the whole family. */
export async function refreshSession(refreshToken: string, actor: Actor, meta: ClientMeta): Promise<AuthSession> {
  const hash = hashRefreshToken(refreshToken);
  const outcome = await withTransaction(async (tx) => {
    const sessions = new PostgresSessionRepository(tx);
    const record = await sessions.findRefreshTokenForUpdate(hash);
    if (!record) return { error: 'invalid' as const };
    if (record.revokedAt) {
      if (record.replacedBy) {
        await sessions.revokeFamily(record.familyId, 'REUSE_DETECTED');
        await audit(tx, { ...actor, userId: record.userId }, 'AUTH_REFRESH_REUSE_DETECTED', 'session', record.familyId);
        return { error: 'reuse' as const };
      }
      return { error: 'revoked' as const };
    }
    if (record.expiresAt.getTime() <= Date.now()) return { error: 'expired' as const };
    const user = await new PostgresUserRepository(tx).findById(record.userId);
    if (!user || user.status !== 'ACTIVE') {
      await sessions.revokeFamily(record.familyId, 'ACCOUNT_DISABLED');
      return { error: 'disabled' as const };
    }
    const session = await issueSession(tx, user, meta, record.familyId);
    const next = await sessions.findRefreshTokenForUpdate(hashRefreshToken(session.refreshToken));
    await sessions.markRotated(record.id, next!.id);
    return { session };
  });
  if ('error' in outcome) throw unauthorized('Your session has ended. Please sign in again.');
  return outcome.session;
}

export async function logout(auth: { userId: string; sessionId: string } | undefined, refreshToken: string | undefined, actor: Actor): Promise<void> {
  const sessions = new PostgresSessionRepository(db());
  if (refreshToken) {
    const record = await withTransaction((tx) => new PostgresSessionRepository(tx).findRefreshTokenForUpdate(hashRefreshToken(refreshToken)));
    if (record && (!auth || record.userId === auth.userId)) await sessions.revokeFamily(record.familyId, 'LOGOUT');
  }
  if (auth) await sessions.revokeFamily(auth.sessionId, 'LOGOUT');
  await audit(db(), actor, 'AUTH_LOGOUT', 'session', auth?.sessionId ?? null);
}

export async function forgotPassword(email: string, actor: Actor): Promise<void> {
  const users = new PostgresUserRepository(db());
  const user = await users.findByEmail(email);
  // Always respond identically; only send mail when an active account exists.
  if (!user || user.status !== 'ACTIVE' || user.anonymisedAt) {
    await audit(db(), actor, 'AUTH_PASSWORD_RESET_REQUESTED', 'user', null, { matched: false });
    return;
  }
  const token = randomToken(32);
  await new PostgresSessionRepository(db()).createResetToken(user.id, sha256(token), new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000));
  await audit(db(), { ...actor, userId: user.id }, 'AUTH_PASSWORD_RESET_REQUESTED', 'user', user.id, { matched: true });
  const link = `${config().PASSWORD_RESET_URL}?token=${encodeURIComponent(token)}`;
  await integrations().email.send({
    to: user.email,
    subject: 'Reset your HYDRA password',
    text: `Hi ${user.firstName || 'there'},\n\nUse the link below within ${RESET_TOKEN_TTL_MINUTES} minutes to reset your PSG Electrical HYDRA password:\n\n${link}\n\nIf you did not request this, you can ignore this email.\n`,
  });
}

export async function resetPassword(token: string, password: string, actor: Actor): Promise<void> {
  const passwordHash = await hashPassword(password);
  await withTransaction(async (tx) => {
    const consumed = await new PostgresSessionRepository(tx).consumeResetToken(sha256(token));
    if (!consumed) throw businessRule('This reset link is invalid or has expired. Request a new one.', 'RESET_TOKEN_INVALID');
    await new PostgresUserRepository(tx).setPassword(consumed.userId, passwordHash);
    await new PostgresSessionRepository(tx).revokeAllForUser(consumed.userId, 'PASSWORD_RESET');
    await audit(tx, { ...actor, userId: consumed.userId }, 'AUTH_PASSWORD_RESET', 'user', consumed.userId);
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, actor: Actor): Promise<void> {
  const users = new PostgresUserRepository(db());
  const user = await users.findById(userId);
  if (!user) throw unauthorized();
  // Google-only accounts have no current password to prove; they create one through the emailed
  // reset link (which proves control of the address) instead of from an existing session.
  if (!user.passwordHash) {
    throw businessRule('This account signs in with Google and has no password yet. Use “Forgot password” on the sign-in screen to create one.', 'NO_LOCAL_PASSWORD');
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw businessRule('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }
  const hash = await hashPassword(newPassword);
  await withTransaction(async (tx) => {
    await new PostgresUserRepository(tx).setPassword(userId, hash);
    await new PostgresSessionRepository(tx).revokeAllForUser(userId, 'PASSWORD_CHANGED');
    await audit(tx, actor, 'AUTH_PASSWORD_CHANGED', 'user', userId);
  });
}

export async function getMe(userId: string) {
  const user = await new PostgresUserRepository(db()).findById(userId);
  if (!user) throw unauthorized();
  return toAuthUser(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const users = new PostgresUserRepository(tx);
    const user = await users.findById(userId);
    if (!user) throw unauthorized();
    const allowed: readonly string[] = SELF_EDITABLE_FIELDS[user.role];
    const blocked = Object.keys(input).filter((k) => !allowed.includes(k));
    if (blocked.length) throw validationError(blocked.map((path) => ({ path, message: 'This field cannot be changed for your account type' })));
    const { address, ...rest } = input;
    const updated = await users.updateProfile(user, { ...rest, ...(address !== undefined ? { address: address || null } : {}) });
    if (!updated) throw notFound('Profile');
    if (input.marketingOptIn !== undefined && user.customerId) await users.recordConsent(userId, 'MARKETING', input.marketingOptIn);
    await audit(tx, actor, 'PROFILE_UPDATED', 'user', userId, { fields: Object.keys(input) });
    return toAuthUser((await users.findById(userId))!);
  });
}

export async function completeOnboarding(userId: string) {
  await new PostgresUserRepository(db()).completeOnboarding(userId);
  return getMe(userId);
}

/** Owner provisions staff accounts (employees / office admins / owners). */
export async function createStaff(input: CreateStaffInput, actor: Actor) {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (tx) => {
    const users = new PostgresUserRepository(tx);
    if (await users.findByEmail(input.email)) throw conflict('An account with this email already exists', 'EMAIL_IN_USE');
    const staffNumber = await users.nextStaffNumber(input.role);
    const userId = await users.create({ email: input.email, passwordHash, role: input.role, staffNumber });
    if (input.role === 'EMPLOYEE') {
      await users.createEmployeeProfile(userId, {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        certificationNo: input.certificationNo ?? null,
        specialisation: input.specialisation ?? null,
        hourlyRate: input.hourlyRate ?? 0,
        taxRate: input.taxRate ?? 0,
      });
    } else {
      await users.createAdminProfile(userId, { firstName: input.firstName, lastName: input.lastName, phone: input.phone });
    }
    await users.completeOnboarding(userId);
    await audit(tx, actor, 'USER_CREATED', 'user', userId, { role: input.role, staffNumber });
    return toAuthUser((await users.findById(userId))!);
  });
}

export async function setUserStatus(targetUserId: string, status: 'ACTIVE' | 'DISABLED', reason: string | undefined, actor: Actor) {
  if (targetUserId === actor.userId) throw businessRule('You cannot change the status of your own account');
  await withTransaction(async (tx) => {
    const users = new PostgresUserRepository(tx);
    const target = await users.findById(targetUserId);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
    await users.setStatus(targetUserId, status);
    if (status === 'DISABLED') await new PostgresSessionRepository(tx).revokeAllForUser(targetUserId, 'ACCOUNT_DISABLED');
    await audit(tx, actor, status === 'DISABLED' ? 'USER_DISABLED' : 'USER_ENABLED', 'user', targetUserId, { role: target.role, reason });
  });
}
