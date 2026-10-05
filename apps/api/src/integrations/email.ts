/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

/** SMTP delivery (production). EMAIL_API_KEY holds the SMTP connection URL. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transport;

  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text });
  }
}

/**
 * Development outbox: writes the message to the local log instead of sending it. Refused in
 * production by config validation, so it can never masquerade as real delivery.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  readonly sent: EmailMessage[] = [];

  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    if (this.sent.length > 50) this.sent.shift();
    logger.info({ to: msg.to, subject: msg.subject, body: msg.text }, '[DEV EMAIL OUTBOX] message not sent externally');
  }
}

export function createEmailProvider(): EmailProvider {
  const cfg = config();
  if (cfg.EMAIL_PROVIDER === 'smtp') {
    if (!cfg.EMAIL_API_KEY) throw new Error('EMAIL_API_KEY (SMTP URL) is required when EMAIL_PROVIDER=smtp');
    return new SmtpEmailProvider(cfg.EMAIL_API_KEY, cfg.EMAIL_FROM);
  }
  return new ConsoleEmailProvider();
}
