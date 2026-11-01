/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
/**
 * Part 3 claim control (brief §2 and §6): public screens make no 24/7, dispatch, response-time or
 * certification claims, and seeded demo records are never presented as real PSG work or people.
 */
import { act, screen, waitFor } from '@testing-library/react-native';
import type { QueryClient } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { Linking } from 'react-native';
import ContactScreen from '../app/(public)/(tabs)/contact';
import QuoteScreen from '../app/(public)/(tabs)/quote';
import ServicesScreen from '../app/(public)/(tabs)/services';
import WorkScreen from '../app/(public)/(tabs)/work';
import PartnersScreen from '../app/(public)/partners';
import TeamScreen from '../app/(public)/team';
import WhyPsgScreen from '../app/(public)/why-psg';
import { mockApi, renderScreen, signOutState } from '../test-utils';

export const FORBIDDEN = /24\/7|24-hour|24 hours|\(24h\)|around the clock|immediate (dispatch|response)|rapid dispatch|live dispatch|hotline|within \d+ (business )?hours|guarantee|binding|ISO ?9001|OHSAS|accredit|certified|master electrician|ECSA|<\s?60|33kV|substation|turnkey|uptime/i;

const SERVICE = { id: 's1', slug: 'emergency-repairs-diagnostics', name: 'Fault Finding', category: 'EMERGENCY', description: 'Electrical fault diagnosis, testing and verification.', basePrice: 1450, isActive: true, slaText: null, badge: null, imageKey: null, specs: [], features: ['Testing and verification'] };
const DEMO_PROJECT = { id: 'p1', title: 'Cape Steel Smelter Substation Overhaul', clientName: 'Cape Smelting Works', location: 'Saldanha', category: 'INDUSTRIAL', description: 'Turnkey HV upgrade', imageKey: null, completedDate: '2024-01-18', featured: true, highlights: [], specBadge: '132kV', accreditation: 'ISO 45001', serviceTypeId: null, isDemo: true };
const REAL_PROJECT = { ...DEMO_PROJECT, id: 'p2', title: 'Warehouse DB upgrade', clientName: 'A logistics client', description: 'Distribution board upgrade.', specBadge: null, accreditation: null, isDemo: false };
const DEMO_MEMBER = { id: 't1', name: 'David Ndlovu', title: 'Lead Electrical Engineer', category: 'ENGINEERING', rating: 4.9, registration: 'Pr.Eng 20110482', licence: null, skills: [], experienceYears: 18, projectsCount: 142, leadProject: null, availability: 'AVAILABLE', photoKey: null, isDemo: true };
const DEMO_PARTNER = { id: 'pa1', name: 'Transnet Freight Rail', category: 'ENTERPRISE_CLIENT', categoryLabel: 'Enterprise', establishedYear: 1990, description: 'Railway traction substation maintenance', tags: [], certification: 'High-Voltage Class-A Vendor', guarantee: 'Multi-Year Service SLA', logoKey: null, isDemo: true };
/** What a database seeded before Part 3 still returns until the content refresh is run. */
const OLD_CONTENT = {
  company: { name: 'PSG Electrical & Cables', tagline: '& Cables · South Africa', hotline: '+27 11 987 6500', emergencyLine: '+27 800 911 911', whatsapp: '', email: 'x@psg.test', established: 2008 },
  metrics: [{ group: 'contact', key: 'emergency', value: '< 15 Mins', label: 'Emergency', caption: '', accent: 'neutral' }],
  accreditations: [{ code: 'ISO 9001', title: 'Quality System', caption: '', accent: 'primary' }],
  certifications: [],
  testimonial: { quote: 'Outstanding', author: 'David Marais', role: 'Ops', rating: 5 },
  isDemoContent: true,
};

let openURL: jest.SpyInstance;
beforeEach(() => {
  signOutState();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  mockApi({
    'GET /public-content': () => OLD_CONTENT,
    'GET /service-types': () => [SERVICE],
    'GET /portfolio': () => [DEMO_PROJECT],
    'GET /team': () => [DEMO_MEMBER],
    'GET /partners': () => [DEMO_PARTNER],
    'GET /faqs': () => [],
    'GET /offices': () => [],
    'GET /departments': () => [],
    'GET /notifications': () => ({ items: [], page: 1, pageSize: 1, total: 0, unread: 0 }),
  });
});
afterEach(() => openURL.mockRestore());

type Node = { children?: unknown; props?: { accessibilityLabel?: unknown } } | string | null | undefined | Node[];
/** All rendered text plus accessibility labels (what users see or hear). */
const collect = (n: unknown): string => {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collect).join(' ');
  const node = n as Exclude<Node, string | null | undefined | Node[]>;
  const label = typeof node.props?.accessibilityLabel === 'string' ? node.props.accessibilityLabel : '';
  return `${label} ${collect(node.children)}`;
};
const visibleText = () => collect(screen.toJSON());

/** Waits for every query to finish so later state updates happen inside act(). */
async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
/** The first forbidden phrase on screen with some context, or null — failures name the offending copy. */
const firstClaim = (rx: RegExp = FORBIDDEN) => {
  const text = visibleText();
  const m = rx.exec(text);
  return m ? text.slice(Math.max(0, m.index - 60), m.index + 60) : null;
};

describe.each<[string, ComponentType]>([
  ['Services', ServicesScreen],
  ['Work', WorkScreen],
  ['Contact', ContactScreen],
  ['Why PSG', WhyPsgScreen],
  ['Team', TeamScreen],
  ['Partners', PartnersScreen],
])('%s screen', (_name, Screen) => {
  it('makes no availability, dispatch or certification claims, even with pre-Part 3 content', async () => {
    const { client } = await renderScreen(<Screen />);
    await settle(client);
    expect(firstClaim()).toBeNull();
    // Demo records and demo company content never surface as real.
    expect(firstClaim(/Cape Steel|David Ndlovu|Transnet|David Marais|\+27 800 911 911/)).toBeNull();
  });
});

describe('published records', () => {
  it('owner-approved (non-demo) projects are shown on the Work tab', async () => {
    mockApi({ 'GET /portfolio': () => [DEMO_PROJECT, REAL_PROJECT], 'GET /public-content': () => OLD_CONTENT, 'GET /notifications': () => ({ items: [], unread: 0 }) });
    const { client } = await renderScreen(<WorkScreen />);
    await settle(client);
    expect(await screen.findByText('Warehouse DB upgrade')).toBeOnTheScreen();
    expect(screen.queryByText(DEMO_PROJECT.title)).toBeNull();
  });

  it('with no published records the Team page explains profiles are coming, instead of inventing people', async () => {
    const { client } = await renderScreen(<TeamScreen />);
    await settle(client);
    expect(await screen.findByText('Team profiles coming soon')).toBeOnTheScreen();
  });
});

describe('contact screen', () => {
  it('lists both verified numbers with labels and the published hours', async () => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    expect(screen.getByLabelText('Call main line 082 603 9283')).toBeOnTheScreen();
    expect(screen.getByLabelText('Call second line 072 752 0848')).toBeOnTheScreen();
    expect(screen.getAllByText(/07:00–18:00/).length).toBeGreaterThan(0);
  });

  it('offers neutral urgency choices that still map to the stored values', async () => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Priority' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Urgent fault' })).toBeOnTheScreen();
  });

  it('removes Fiber & Data Cabling and high-voltage substation from the enquiry categories', async () => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    expect(firstClaim(/Fiber|Fibre|High Voltage Substation/i)).toBeNull();
  });
});

describe('Report a fault deep link', () => {
  it('opens the quote tool with the fault sector already selected', async () => {
    (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams({ sector: 'EMERGENCY' });
    const { client } = await renderScreen(<QuoteScreen />);
    await settle(client);
    await waitFor(() => expect(screen.getByRole('radio', { name: /fault/i })).toBeChecked());
  });
});
