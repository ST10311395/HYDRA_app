import type { MessageChannel } from '@hydra/shared';
import { createEmailProvider, type EmailProvider } from './email';
import { createGoogleVerifier, type GoogleIdentityVerifier } from './google';
import { createMessagingProviders, type MessagingProvider } from './messaging';
import { createPaymentGateway, type PaymentGateway } from './payments';
import { createPushProvider, type PushProvider } from './push';
import { createStorage, type StorageProvider } from './storage';

export interface Integrations {
  google: GoogleIdentityVerifier;
  email: EmailProvider;
  payments: PaymentGateway;
  storage: StorageProvider;
  messaging: Record<MessageChannel, MessagingProvider>;
  push: PushProvider;
}

let current: Integrations | null = null;

/** Lazily constructed external-service adapters. Tests replace individual adapters via `overrideIntegrations`. */
export function integrations(): Integrations {
  if (!current) {
    current = {
      google: createGoogleVerifier(),
      email: createEmailProvider(),
      payments: createPaymentGateway(),
      storage: createStorage(),
      messaging: createMessagingProviders(),
      push: createPushProvider(),
    };
  }
  return current;
}

export function overrideIntegrations(partial: Partial<Integrations>): void {
  current = { ...integrations(), ...partial };
}
