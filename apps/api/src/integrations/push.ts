import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  readonly name: string;
  /** Returns tokens the push service reported as permanently invalid (to be removed). */
  send(tokens: string[], payload: PushPayload): Promise<{ invalidTokens: string[] }>;
}

export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly expo: Expo;

  constructor(accessToken?: string) {
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  async send(tokens: string[], payload: PushPayload): Promise<{ invalidTokens: string[] }> {
    const valid = tokens.filter((t) => Expo.isExpoPushToken(t));
    const invalidTokens: string[] = tokens.filter((t) => !Expo.isExpoPushToken(t as string));
    const messages: ExpoPushMessage[] = valid.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data,
      channelId: 'default',
    }));
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const to = chunk[i]?.to;
            if (typeof to === 'string') invalidTokens.push(to);
          }
        });
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Expo push delivery failed');
      }
    }
    return { invalidTokens };
  }
}

export class DisabledPushProvider implements PushProvider {
  readonly name = 'none';
  async send(): Promise<{ invalidTokens: string[] }> {
    return { invalidTokens: [] };
  }
}

export function createPushProvider(): PushProvider {
  const cfg = config();
  if (cfg.isTest || cfg.PUSH_NOTIFICATION_CONFIG === 'none') return new DisabledPushProvider();
  return new ExpoPushProvider(cfg.EXPO_ACCESS_TOKEN);
}
