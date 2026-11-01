/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
/**
 * Quote scope step (client screenshot IMG-20261021-WA0011): neutral urgency labels that still map to
 * STANDARD | HIGH | EMERGENCY, no 24h / 24/7 promises, and technical fields under "Advanced details".
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import QuoteScreen from '../app/(public)/(tabs)/quote';
import { URGENCY_OPTIONS, urgencyLabel } from '../utils/format';
import { mockApi, renderScreen, renderedText, signOutState } from '../test-utils';

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as { clear: () => Promise<void> };
const setParams = (p: object) => (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams(p);

const SERVICES = [{ id: 'svc-fault', name: 'Fault Finding', category: 'EMERGENCY', slug: 'emergency-repairs-diagnostics', description: '', basePrice: 0, isActive: true, slaText: null, badge: null, imageKey: null, specs: [], features: [] }];

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

let api: ReturnType<typeof mockApi>;
beforeEach(async () => {
  signOutState();
  await AsyncStorage.clear();
  api = mockApi({
    'GET /service-types': () => SERVICES,
    'GET /faqs': () => [],
    'GET /notifications': () => ({ items: [], unread: 0 }),
    'POST /contact-queries': () => ({ id: 'enq-1', reference: 'ENQ-000900', status: 'NEW', submittedAt: new Date().toISOString() }),
  });
});

async function toScopeStep() {
  const { client } = await renderScreen(<QuoteScreen />);
  await settle(client);
  await fireEvent.press(screen.getByRole('radio', { name: /Fault or repair/ }));
  await fireEvent.press(screen.getByText('Continue to Scope'));
}

describe('urgency labels', () => {
  it('are Standard, Priority and Urgent fault, mapped to the unchanged stored values', () => {
    expect(URGENCY_OPTIONS).toEqual([
      { value: 'STANDARD', label: 'Standard' },
      { value: 'HIGH', label: 'Priority' },
      { value: 'EMERGENCY', label: 'Urgent fault' },
    ]);
    expect(urgencyLabel('EMERGENCY')).toBe('Urgent fault');
  });

  it('the scope step promises no 24-hour or 24/7 response', async () => {
    await toScopeStep();
    const text = renderedText(screen.toJSON());
    expect(text).not.toMatch(/24h|24\/7|24 hours|Critical|SLA|Turnaround|guarantee(?!d response time)/i);
    expect(screen.getByRole('radio', { name: 'Urgent fault' })).toBeOnTheScreen();
    expect(text).toMatch(/not a guaranteed response time/);
  });

  it('choosing Urgent fault still submits urgency EMERGENCY for triage', async () => {
    await toScopeStep();
    await fireEvent.changeText(screen.getByLabelText('Scope brief'), 'Main breaker trips when the geyser switches on');
    await fireEvent.press(screen.getByRole('radio', { name: 'Urgent fault' }));
    await fireEvent.press(screen.getByText('Continue to Location'));
    await fireEvent.changeText(screen.getByLabelText('Site address'), '14 Marine Drive, Umhlanga');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Thabo Guest');
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'thabo@example.com');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), '082 555 0100');
    await fireEvent.press(screen.getByText('Continue to Submit'));
    expect(screen.getByText('Urgent fault')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Submit Quotation Request'));
    await waitFor(() => expect(screen.getByText('ENQ-000900')).toBeOnTheScreen());
    const body = api.find('POST', '/contact-queries')[0]!.body as { urgency: string; sector: string; message: string; details: { voltageLevel?: string } };
    expect(body.urgency).toBe('EMERGENCY');
    expect(body.sector).toBe('Fault or repair');
    // Nothing technical is sent unless the customer filled it in.
    expect(body.message).not.toMatch(/Voltage|Supply|kVA/);
    expect(body.details.voltageLevel).toBeUndefined();
    expect(screen.getByText(/We will contact you during office hours/)).toBeOnTheScreen();
  });
});

describe('advanced details', () => {
  it('hides supply type and kVA from the standard path until opened', async () => {
    await toScopeStep();
    expect(screen.queryByLabelText('Estimated load (kVA)')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Advanced details \(optional\)/ }));
    expect(screen.getByLabelText('Estimated load (kVA)')).toBeOnTheScreen();
  });

  it('opens automatically when the load estimator sends a kVA value', async () => {
    setParams({ sector: 'INDUSTRIAL', kva: '150' });
    await toScopeStep();
    expect(screen.getByLabelText('Estimated load (kVA)')).toHaveDisplayValue('150');
  });

  it('no longer offers 11–33 kV supply options', async () => {
    await toScopeStep();
    await fireEvent.press(screen.getByRole('button', { name: /^Advanced details \(optional\)/ }));
    expect(renderedText(screen.toJSON())).not.toMatch(/11kV|22kV|33kV|High Voltage/i);
  });
});
