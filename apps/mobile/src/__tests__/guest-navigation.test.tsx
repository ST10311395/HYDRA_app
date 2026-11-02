/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Part 3 guest journey: five clear tabs (Home · Services · Work · Quote · Contact), plain-language
 * discovery sections, and technical tools tucked behind an "advanced" disclosure.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '../app/(public)/(tabs)/home';
import ServicesScreen from '../app/(public)/(tabs)/services';
import WorkScreen from '../app/(public)/(tabs)/work';
import { mockApi, renderScreen, signOutState } from '../test-utils';

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  signOutState();
  mockApi({
    'GET /public-content': () => ({ company: { name: 'PSG', tagline: '', hotline: '', emergencyLine: '', whatsapp: '', email: '', established: 0 }, metrics: [], accreditations: [], certifications: [], testimonial: null, isDemoContent: false }),
    'GET /service-types': () => [],
    'GET /portfolio': () => [],
    'GET /notifications': () => ({ items: [], unread: 0 }),
  });
});

describe('guest navigation', () => {
  it('has exactly the five destinations the client asked for, in order', () => {
    const layout = readFileSync(join(__dirname, '../app/(public)/(tabs)/_layout.tsx'), 'utf8');
    const labels = [...layout.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(labels).toEqual(['Home', 'Services', 'Work', 'Quote', 'Contact']);
  });

  it('home explains how a job works and which industries PSG serves, in plain language', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    expect(screen.getByTestId('process-steps')).toBeOnTheScreen();
    expect(screen.getByText('Tell us what you need')).toBeOnTheScreen();
    expect(screen.getByTestId('sector-list')).toBeOnTheScreen();
    expect(screen.getByText('Chemical & hazardous environments')).toBeOnTheScreen();
  });

  it('home always lists PSG\'s six services, even when the service catalogue cannot load', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    expect(screen.getByTestId('service-overview')).toBeOnTheScreen();
    for (const name of ['Electrical installations', 'Fault finding', 'Distribution boards', 'Compliance (CoC)', 'Maintenance & repairs', 'Solar & backup power']) {
      expect(screen.getByRole('link', { name })).toBeOnTheScreen();
    }
  });

  it('the Work tab shows portfolio clients, industries and capabilities when no project case studies are published', async () => {
    const { client } = await renderScreen(<WorkScreen />);
    await settle(client);
    expect(screen.getByTestId('client-list')).toBeOnTheScreen();
    expect(screen.getByTestId('sector-list')).toBeOnTheScreen();
    expect(screen.getByTestId('capabilities')).toBeOnTheScreen();
  });

  it('the technical kVA estimator is hidden by default on Services and still works when opened', async () => {
    const { client } = await renderScreen(<ServicesScreen />);
    await settle(client);
    expect(screen.queryByText(/kVA/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Advanced: estimate your power load/ }));
    expect(screen.getAllByText(/kVA/).length).toBeGreaterThan(0);
    expect(screen.getByText('Use in a quote request')).toBeOnTheScreen();
  });
});
