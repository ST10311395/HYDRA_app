/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Guest home (client screenshots IMG-20261021-WA0010 / WA0009): hazardous-area hero, no 24/7 or
 * high-voltage claims, and quote / fault / call actions that reach the existing flows.
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import HomeScreen from '../app/(public)/(tabs)/home';
import { HERO } from '../content/marketing';
import { mockApi, renderScreen, signOutState } from '../test-utils';

const FORBIDDEN = /24\/7|24 hours|turnkey|high-voltage|substation|33kV|live dispatch|ISO ?9001|accredit|master electrician|EST\. \d{4}/i;

/** All rendered text plus accessibility labels. */
const collect = (n: unknown): string => {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collect).join(' ');
  const node = n as { children?: unknown; props?: { accessibilityLabel?: unknown } };
  return `${typeof node.props?.accessibilityLabel === 'string' ? node.props.accessibilityLabel : ''} ${collect(node.children)}`;
};

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

let openURL: jest.SpyInstance;
beforeEach(() => {
  signOutState();
  (router.navigate as jest.Mock).mockClear();
  (router.push as jest.Mock).mockClear();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  mockApi({
    'GET /public-content': () => ({ company: { name: 'PSG', tagline: '', hotline: '+27 11 987 6500', emergencyLine: '+27 800 911 911', whatsapp: '', email: '', established: 2008 }, metrics: [], accreditations: [], certifications: [], testimonial: null, isDemoContent: true }),
    'GET /service-types': () => [],
    'GET /portfolio': () => [],
    'GET /notifications': () => ({ items: [], unread: 0 }),
  });
});
afterEach(() => openURL.mockRestore());

describe('guest home hero', () => {
  it('shows the requested hazardous-area testing copy in place of the turnkey / 24/7 paragraph', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    expect(screen.getByText(HERO.body)).toBeOnTheScreen();
    expect(HERO.body).toMatch(/hazardous-area electrical testing and inspections/i);
    expect(collect(screen.toJSON())).not.toMatch(FORBIDDEN);
  });

  it('Request a quote opens the quote tab', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    await fireEvent.press(screen.getByTestId('home-quote'));
    expect(router.navigate).toHaveBeenCalledWith('/quote');
  });

  it('Report a fault replaces the 24/7 Emergency button and opens the fault request flow', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    expect(screen.queryByText('24/7 Emergency')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-fault'));
    expect(router.navigate).toHaveBeenCalledWith({ pathname: '/quote', params: { sector: 'EMERGENCY' } });
  });

  it('Call PSG dials the verified number, not the seeded emergency line', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    await fireEvent.press(screen.getByTestId('home-call'));
    expect(openURL).toHaveBeenCalledWith('tel:0826039283');
  });
});

describe('guest home promotions (client screenshot IMG-20261021-WA0009)', () => {
  it('the circled quote promo, extra tiles and account promo are gone', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    expect(collect(screen.toJSON())).not.toMatch(/engineer-reviewed|within 24 hours|binding|Launch Multi-Step|Contact Engineering Desk|Track your jobs, quotes & rewards|Why Choose PSG/i);
  });

  it('Quote and Contact remain top-level tabs (the account menu is covered in header-account tests)', () => {
    const tabs = readFileSync(join(__dirname, '../app/(public)/(tabs)/_layout.tsx'), 'utf8');
    expect(tabs).toMatch(/name="quote"/);
    expect(tabs).toMatch(/name="contact"/);
  });

  it.each([
    ['Why PSG', '/why-psg'],
    ['Our team', '/team'],
    ['Partners', '/partners'],
    ['FAQ', '/faq'],
  ])('the footer still links to %s', async (label, href) => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    await fireEvent.press(screen.getByRole('link', { name: label }));
    expect(router.push).toHaveBeenCalledWith(href);
  });
});
