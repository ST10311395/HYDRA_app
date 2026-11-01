/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
/**
 * Part 3 workflow regressions: a signed-in customer's quote still creates a trackable job with the
 * matching service and urgency, and jobs saved before Part 3 still display readably for every role.
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import QuoteScreen from '../app/(public)/(tabs)/quote';
import AdminJobDetail from '../app/admin/job/[id]';
import CustomerJobDetail from '../app/customer/job/[id]';
import EmployeeJobDetail from '../app/employee/job/[id]';
import { JOB_ID, makeJob, mockApi, renderScreen, respond, signInAs } from '../test-utils';

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as { clear: () => Promise<void> };
const setParams = (p: object) => (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams(p);

const SERVICES = [
  { id: 'svc-install', name: 'Electrical Installations', category: 'CABLING', slug: 'industrial-cabling-fibre', description: '', basePrice: 0, isActive: true, slaText: null, badge: null, imageKey: null, specs: [], features: [] },
  { id: 'svc-fault', name: 'Fault Finding', category: 'EMERGENCY', slug: 'emergency-repairs-diagnostics', description: '', basePrice: 0, isActive: true, slaText: null, badge: null, imageKey: null, specs: [], features: [] },
];

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  (router.push as jest.Mock).mockClear();
});

describe('customer quote → job', () => {
  it('Fault or repair creates a job on the matching service, urgent by default, with the site type recorded', async () => {
    signInAs('CUSTOMER', { phone: '+27 82 555 0100' });
    const api = mockApi({
      'GET /service-types': () => SERVICES,
      'GET /faqs': () => [],
      'GET /notifications': () => ({ items: [], unread: 0 }),
      'POST /jobs': () => respond(201, makeJob({ status: 'REQUESTED', reference: 'JOB-2026-0777' })),
    });
    const { client } = await renderScreen(<QuoteScreen />);
    await settle(client);
    await fireEvent.press(screen.getByRole('radio', { name: /Fault or repair/ }));
    await fireEvent.press(screen.getByLabelText(/^Type of site \(optional\)/));
    await fireEvent.press(await screen.findByText(/^Commercial —/));
    await fireEvent.press(screen.getByText('Continue to Scope'));
    await fireEvent.changeText(screen.getByLabelText('Scope brief'), 'Burning smell at the distribution board');
    expect(screen.getByRole('radio', { name: 'Urgent fault' })).toBeChecked();
    await fireEvent.press(screen.getByText('Continue to Location'));
    await fireEvent.changeText(screen.getByLabelText('Site address'), '1 Test Road, Durban');
    await fireEvent.press(screen.getByText('Continue to Submit'));
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Submit Service Request'));
    await waitFor(() => expect(screen.getByText('JOB-2026-0777')).toBeOnTheScreen());

    const body = api.find('POST', '/jobs')[0]!.body as { serviceTypeId: string; urgency: string; description: string };
    expect(body.serviceTypeId).toBe('svc-fault');
    expect(body.urgency).toBe('EMERGENCY');
    expect(body.description).toContain('[Fault or repair]');
    expect(body.description).toContain('Site type: Commercial');
    expect(api.find('POST', '/contact-queries')).toHaveLength(0);
    await fireEvent.press(screen.getByText('Track this request'));
    expect(router.push).toHaveBeenCalledWith(`/customer/job/${JOB_ID}`);
  });
});

describe('jobs saved before Part 3', () => {
  const legacy = makeJob({ urgency: 'EMERGENCY', serviceType: { ...makeJob().serviceType, name: '24/7 Emergency Repairs & Diagnostics' } });

  it.each([
    ['customer', 'CUSTOMER', CustomerJobDetail],
    ['electrician', 'EMPLOYEE', EmployeeJobDetail],
    ['office', 'ADMIN_OFFICE', AdminJobDetail],
  ] as const)('the %s job screen still opens and shows urgency as a label, not a raw value', async (_who, role, Screen) => {
    signInAs(role);
    setParams({ id: JOB_ID });
    mockApi({
      'GET /jobs/:id': () => legacy,
      'GET /notifications': () => ({ items: [], unread: 0 }),
      'GET /service-types': () => SERVICES,
    });
    const { client } = await renderScreen(<Screen />);
    await settle(client);
    expect(await screen.findByText('Urgent fault')).toBeOnTheScreen();
    expect(screen.queryByText('EMERGENCY')).toBeNull();
  });
});
