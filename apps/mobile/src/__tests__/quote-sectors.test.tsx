/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
/**
 * Quote sectors (client screenshot IMG-20261021-WA0012): website intake categories, no Fiber & Data
 * Cabling and no HVAC wording, while older deep links, saved drafts and stored enquiries keep working.
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react-native';
import QuoteScreen from '../app/(public)/(tabs)/quote';
import EnquiryDetail from '../app/admin/enquiry/[id]';
import { SECTORS, resolveSector } from '../features/quoteSectors';
import { mockApi, renderScreen, renderedText, signInAs, signOutState } from '../test-utils';

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as { setItem: (k: string, v: string) => Promise<void>; clear: () => Promise<void> };
const setParams = (p: object) => (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams(p);

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(async () => {
  signOutState();
  await AsyncStorage.clear();
  mockApi({ 'GET /service-types': () => [], 'GET /faqs': () => [], 'GET /notifications': () => ({ items: [], unread: 0 }) });
});

describe('quote sectors', () => {
  it('offers the six PSG website categories in order', () => {
    expect(SECTORS.map((s) => s.title)).toEqual(['New installation', 'Fault or repair', 'DB board', 'Compliance (CoC)', 'Solar & backup', 'Maintenance']);
  });

  it('shows no Fiber & Data Cabling, HVAC or substation wording on the picker', async () => {
    const { client } = await renderScreen(<QuoteScreen />);
    await settle(client);
    const text = renderedText(screen.toJSON());
    expect(text).not.toMatch(/Fiber|Fibre|HVAC|Substation/i);
    for (const s of SECTORS) expect(screen.getByRole('radio', { name: new RegExp(`${s.title.replace(/[()]/g, '\\$&')}`) })).toBeOnTheScreen();
  });

  it('commercial work is still a choice, as a site type described without HVAC', async () => {
    const { client } = await renderScreen(<QuoteScreen />);
    await settle(client);
    expect(screen.getByLabelText(/^Type of site \(optional\)/)).toBeOnTheScreen();
  });
});

describe('compatibility with links, drafts and records from before Part 3', () => {
  it.each([
    ['INDUSTRIAL', { sector: 'INSTALL', site: 'INDUSTRIAL' }],
    ['COMMERCIAL', { sector: 'INSTALL', site: 'COMMERCIAL' }],
    ['FIBRE', { sector: 'INSTALL' }],
    ['AUDIT', { sector: 'COC' }],
    ['EMERGENCY', { sector: 'FAULT' }],
    ['SOLAR', { sector: 'SOLAR' }],
  ])('legacy sector %s maps to a current category', (key, expected) => {
    expect(resolveSector(key)).toEqual(expected);
  });

  it('a draft saved with the removed Fiber sector opens safely as a new installation', async () => {
    await AsyncStorage.setItem('hydra.quote-draft.v1', JSON.stringify({ sector: 'FIBRE', scope: 'Old fibre draft text' }));
    const { client } = await renderScreen(<QuoteScreen />);
    await settle(client);
    await waitFor(() => expect(screen.getByRole('radio', { name: /New installation/ })).toBeChecked());
  });

  it('the estimator deep link (sector=INDUSTRIAL) still preselects installation', async () => {
    setParams({ sector: 'INDUSTRIAL' });
    const { client } = await renderScreen(<QuoteScreen />);
    await settle(client);
    await waitFor(() => expect(screen.getByRole('radio', { name: /New installation/ })).toBeChecked());
  });

  it('an enquiry stored under the old Fiber & Data Cabling sector still reads correctly for the office', async () => {
    signInAs('ADMIN_OFFICE');
    setParams({ id: 'e1' });
    mockApi({
      'GET /contact-queries/:id': () => ({
        id: 'e1', reference: 'ENQ-000123', name: 'Old Lead', email: 'old@example.com', phone: '0820000000', sector: 'Fiber & Data Cabling', urgency: 'HIGH',
        message: '[Fiber & Data Cabling] Backbone', source: 'QUOTE_TOOL', details: { sector: 'Fiber & Data Cabling', voltageLevel: 'Medium Voltage (11kV)' },
        status: 'NEW', assignedAdminName: null, adminNotes: null, convertedJobId: null, convertedJobReference: null, convertedCustomerId: null,
        submittedAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z',
      }),
      'GET /service-types': () => [],
      'GET /notifications': () => ({ items: [], unread: 0 }),
    });
    const { client } = await renderScreen(<EnquiryDetail />);
    await settle(client);
    expect((await screen.findAllByText('ENQ-000123', { exact: false })).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fiber & Data Cabling').length).toBeGreaterThan(0);
  });
});
