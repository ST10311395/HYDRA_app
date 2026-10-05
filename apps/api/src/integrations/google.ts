import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { serviceUnavailable, unauthorized } from '../utils/errors';

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

export interface GoogleIdentityVerifier {
  readonly configured: boolean;
  verify(idToken: string): Promise<GoogleIdentity>;
}

/**
 * Verifies Google ID tokens server-side (signature against Google's JWKS, issuer, expiry and
 * audience = one of HYDRA's OAuth client IDs). The Google token is never used as a HYDRA session.
 */
export class GoogleAuthLibraryVerifier implements GoogleIdentityVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly audiences: string[]) {}

  get configured(): boolean {
    return this.audiences.length > 0;
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.configured) {
      throw serviceUnavailable('Google Sign-In is not configured on this server', 'GOOGLE_NOT_CONFIGURED');
    }
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      payload = ticket.getPayload();
    } catch {
      throw unauthorized('Google sign-in could not be verified');
    }
    if (!payload?.sub || !payload.email) throw unauthorized('Google account has no verified email');
    if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
      throw unauthorized('Google sign-in could not be verified');
    }
    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      givenName: payload.given_name ?? null,
      familyName: payload.family_name ?? null,
    };
  }
}

export function createGoogleVerifier(): GoogleIdentityVerifier {
  return new GoogleAuthLibraryVerifier(config().googleClientIds);
}
