import { z } from 'zod';
import { ROLES } from '../enums.js';
import { email, optionalText, password, phone, trimmed } from './common.js';

export const registerSchema = z.object({
  firstName: trimmed(80, 1),
  lastName: trimmed(80, 1),
  email,
  phone,
  password,
  address: optionalText(300),
  acceptPrivacyPolicy: z.literal(true, { message: 'You must accept the privacy notice to continue' }),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** `identifier` is an email address, or a staff number for employees (e.g. PSG-E-0001). */
export const loginSchema = z.object({
  identifier: trimmed(254, 1),
  password: z.string().min(1, { message: 'Enter your password' }).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const googleLoginSchema = z.object({
  idToken: z.string().min(20).max(4096),
  /** Customers must explicitly consent before a new account is created from a Google identity. */
  acceptPrivacyPolicy: z.boolean().optional(),
  phone: phone.optional(),
});
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const logoutSchema = z.object({ refreshToken: z.string().min(20).max(512).optional() });

export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(256),
  password,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'Enter your current password' }).max(128),
    newPassword: password,
  })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a password different from your current one' });

export const pushTokenSchema = z.object({
  token: trimmed(256, 10),
  platform: z.enum(['ios', 'android', 'web']),
});

/**
 * Self-service profile correction (every role). Strict: identity, role, staff number, pay, rewards
 * and other organisation-controlled fields are rejected rather than silently dropped. Email is not
 * self-editable (it is the sign-in identity and the Google-link key). `address` and
 * `marketingOptIn` are customer-only; an empty address clears it.
 */
export const updateProfileSchema = z.strictObject({
  firstName: trimmed(80, 1).optional(),
  lastName: trimmed(80, 1).optional(),
  phone: phone.optional(),
  address: trimmed(300).nullable().optional(),
  marketingOptIn: z.boolean().optional(),
});
/** Fields a role may change on its own profile (the API enforces the same rule). */
export const SELF_EDITABLE_FIELDS = {
  CUSTOMER: ['firstName', 'lastName', 'phone', 'address', 'marketingOptIn'],
  EMPLOYEE: ['firstName', 'lastName', 'phone'],
  ADMIN_OFFICE: ['firstName', 'lastName', 'phone'],
  ADMIN_OWNER: ['firstName', 'lastName', 'phone'],
} as const satisfies Record<(typeof ROLES)[number], readonly (keyof z.input<typeof updateProfileSchema>)[]>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createStaffSchema = z.object({
  role: z.enum(['EMPLOYEE', 'ADMIN_OFFICE', 'ADMIN_OWNER']),
  firstName: trimmed(80, 1),
  lastName: trimmed(80, 1),
  email,
  phone,
  password,
  certificationNo: optionalText(60),
  specialisation: optionalText(120),
  hourlyRate: z.number().min(0).max(10_000).optional(),
  taxRate: z.number().min(0).max(0.45).optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
  reason: optionalText(300),
});

export const dataRequestSchema = z.object({
  type: z.enum(['ACCESS', 'CORRECTION', 'DELETION']),
  details: optionalText(1000),
});

export interface AuthUser {
  id: string;
  email: string;
  role: (typeof ROLES)[number];
  firstName: string;
  lastName: string;
  phone: string | null;
  customerId: string | null;
  employeeId: string | null;
  adminId: string | null;
  staffNumber: string | null;
  onboardingCompleted: boolean;
  hasGoogleLink: boolean;
  /** Customer profile address (null for staff). */
  address: string | null;
  /** Customer marketing consent (false for staff). */
  marketingOptIn: boolean;
  /** False for Google-only accounts: password change is unavailable until one is set via reset. */
  hasPassword: boolean;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}
