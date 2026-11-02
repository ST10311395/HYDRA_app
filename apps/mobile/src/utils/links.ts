/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Linking, Platform } from 'react-native';
import { toast } from '../design-system';

/**
 * Builders for every external action in the app (call, email, WhatsApp, directions) plus one safe
 * launcher. Each action opens its specific handler — never a generic share sheet.
 */

/** `tel:` URL with only digits and a leading +. Check `isDialable` first. */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** At least a full local number (e.g. 082 603 9283); rejects blanks and fragments such as an extension. */
export function isDialable(phone: string | null | undefined): phone is string {
  return !!phone && phone.replace(/\D/g, '').length >= 9;
}

export function mailtoUrl(email: string, subject?: string): string {
  return `mailto:${email.trim()}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}

/** South African local numbers (0XX…) become international (27XX…) as wa.me requires. */
export function whatsappUrl(phone: string, text?: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `27${digits.slice(1)}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export interface MapTarget {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

const validCoord = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * Turn-by-turn directions to this record's own stored coordinates, else its address. Returns null
 * when the record has neither (the caller shows a message instead of opening a blank map).
 */
export function directionsUrl(target: MapTarget, os: string = Platform.OS): string | null {
  const address = target.address?.trim();
  const dest = validCoord(target.latitude, target.longitude) ? `${target.latitude},${target.longitude}` : address ? encodeURIComponent(address) : null;
  if (!dest) return null;
  return os === 'ios' ? `https://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** Map pin (not directions) for a recorded point such as a check-in location. */
export function mapPinUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/**
 * Opens an external URL without ever throwing. When the device has no handler (no phone app on a
 * tablet or desktop browser, no mail client, malformed URL) the user sees `fallback` — e.g. the
 * number to dial — instead of an unhandled promise rejection.
 */
export async function openExternal(url: string | null | undefined, fallback?: string): Promise<boolean> {
  if (!url) {
    toast.info(fallback ?? 'This action is not available for this record.');
    return false;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    toast.info(fallback ?? 'No app on this device can open this link.');
    return false;
  }
}

/**
 * Opens the phone dialer. Desktop browsers often accept `tel:` without any handler, so on the web the
 * number is also shown, ensuring the user can always dial it manually.
 */
export async function callNumber(phone: string | null | undefined, os: string = Platform.OS): Promise<boolean> {
  if (!isDialable(phone)) return openExternal(null, 'No phone number on record.');
  const opened = await openExternal(telUrl(phone), `Calling isn’t available on this device. Dial ${phone}.`);
  if (opened && os === 'web') toast.info(`Call ${phone}`);
  return opened;
}

export const sendEmail = (email: string | null | undefined, subject?: string) =>
  openExternal(email ? mailtoUrl(email, subject) : null, email ? `No email app found. Write to ${email}.` : 'No email address on record.');

export const openWhatsApp = (phone: string | null | undefined, text?: string) =>
  openExternal(phone ? whatsappUrl(phone, text) : null, phone ? `WhatsApp isn’t available. Message ${phone}.` : 'No WhatsApp number on record.');

export const openDirections = (target: MapTarget) =>
  openExternal(directionsUrl(target), target.address ? `Maps isn’t available. Address: ${target.address}` : 'No address or location is recorded for this site.');
