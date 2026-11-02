/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Owner-confirmed facts (2 November 2026): 25+ years of experience, the five portfolio clients and
 * their logos, and a 12-month warranty on workmanship only. Nothing beyond those is invented.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import HomeScreen from '../app/(public)/(tabs)/home';
import QuoteScreen from '../app/(public)/(tabs)/quote';
import WorkScreen from '../app/(public)/(tabs)/work';
import WhyPsgScreen from '../app/(public)/why-psg';
import { PSG_FACTS } from '../content/company';
import { CLIENTS } from '../content/marketing';
import { mockApi, renderScreen, renderedText, signOutState } from '../test-utils';

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  signOutState();
  (router.navigate as jest.Mock).mockClear();
  mockApi({
    'GET /public-content': () => ({ company: { name: 'PSG', tagline: '', hotline: '', emergencyLine: '', whatsapp: '', email: '', established: 0 }, metrics: [], accreditations: [], certifications: [], testimonial: null, isDemoContent: false }),
    'GET /service-types': () => [],
    'GET /portfolio': () => [],
    'GET /faqs': () => [],
    'GET /notifications': () => ({ items: [], unread: 0 }),
  });
});

describe('portfolio clients', () => {
  it('are exactly the five clients in the owner’s portfolio, each with its logo', () => {
    expect(CLIENTS.map((c) => c.name)).toEqual(['African Logistics Services', 'Swift Chemicals', 'Fashion Fusion', 'Hi-Tap Bolt & Tool', 'UKZN']);
    for (const c of CLIENTS) expect(c.logo).toBeTruthy();
  });

  it('are listed on the Work tab with what PSG did for them', async () => {
    const { client } = await renderScreen(<WorkScreen />);
    await settle(client);
    const list = screen.getByTestId('client-list');
    for (const c of CLIENTS) expect(renderedText(list)).toContain(c.name);
    expect(screen.getByLabelText(/^Swift Chemicals\. Electrical work conducted in a hazardous chemical processing environment/)).toBeOnTheScreen();
  });

  it('appear on Home as a logo strip that opens the Work tab', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    await fireEvent.press(screen.getByTestId('client-strip'));
    expect(router.navigate).toHaveBeenCalledWith('/work');
  });
});

describe('experience and warranty', () => {
  it('Home states 25+ years of experience and the 12-month workmanship warranty, without a founding year', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    expect(screen.getByText('25+ years experience')).toBeOnTheScreen();
    expect(screen.getByText('12-month workmanship warranty')).toBeOnTheScreen();
    expect(renderedText(screen.toJSON())).not.toMatch(/\bEST\.?\s*\d{4}|founded|since (19|20)\d{2}/i);
  });

  it('the warranty is described as workmanship only, never as cover for equipment or materials', async () => {
    expect(PSG_FACTS.warrantyDetail).toMatch(/workmanship only, not supplied equipment or materials/);
    const { client } = await renderScreen(<WhyPsgScreen />);
    await settle(client);
    expect(renderedText(screen.getByTestId('warranty'))).toContain(PSG_FACTS.warrantyDetail);
    expect(screen.getByText('25+ years of industry experience')).toBeOnTheScreen();
  });

  it('the quote form mentions the workmanship warranty', async () => {
    const { client } = await renderScreen(<QuoteScreen />);
    await settle(client);
    expect(renderedText(screen.getByTestId('quote-intro'))).toMatch(/Our workmanship carries a 12-month warranty/);
  });

  it('the admin quote builder’s default terms limit the warranty to workmanship', () => {
    const src = readFileSync(join(__dirname, '../app/admin/quote/[id].tsx'), 'utf8');
    expect(src).toMatch(/12-month warranty \(workmanship only; supplied equipment and materials are not included/);
    expect(src).not.toMatch(/Workmanship guaranteed/);
  });
});
