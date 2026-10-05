/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Guest quotation (RFQ) flow and external actions (physical-phone review §11–§14).
 * Selecting a preferred contact method is form state only — it must never open WhatsApp, a share
 * sheet or any URL. Explicit contact actions open their specific handler and never crash.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';
import QuoteScreen from '../app/(public)/(tabs)/quote';
import { directionsUrl, mailtoUrl, openDirections, openExternal, telUrl, whatsappUrl } from '../utils/links';
import { apiError, lastToast, mockApi, pressTwiceSameFrame, renderScreen, signOutState } from '../test-utils';

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as { clear: () => Promise<void> };

const SERVICES = [
  { id: 'svc-solar', name: 'Solar PV installation', category: 'SOLAR', slug: 'solar', description: '', basePrice: 0, isActive: true },
  { id: 'svc-sub', name: 'Substation maintenance', category: 'SUBSTATIONS', slug: 'sub', description: '', basePrice: 0, isActive: true },
];

function routes(overrides: Record<string, (c: { body: unknown }) => unknown> = {}) {
  return mockApi({
    'GET /service-types': () => SERVICES,
    'GET /faqs': () => [],
    'GET /public-content': () => ({ company: { hotline: '011 000 0000', emergencyLine: '011 000 0001', whatsapp: '082 000 0002' } }),
    'POST /contact-queries': () => ({ id: 'enq-1', reference: 'ENQ-000777', status: 'NEW', submittedAt: new Date().toISOString() }),
    ...overrides,
  });
}

let openURL: jest.SpyInstance;
let share: jest.SpyInstance;
beforeEach(async () => {
  signOutState();
  await AsyncStorage.clear();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
});
afterEach(() => {
  openURL.mockRestore();
  share.mockRestore();
});

async function goToLocationStep() {
  await fireEvent.press(screen.getByRole('radio', { name: /Solar & Energy Storage/ }));
  await fireEvent.press(screen.getByText('Continue to Scope'));
  await fireEvent.changeText(screen.getByLabelText('Scope brief'), 'Roof-mounted 10 kVA hybrid system with battery');
  await fireEvent.press(screen.getByText('Continue to Location'));
  await waitFor(() => expect(screen.getByLabelText('Site address')).toBeOnTheScreen());
}

async function fillContact() {
  await fireEvent.changeText(screen.getByLabelText('Site address'), '14 Marine Drive, Umhlanga');
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Thabo Guest');
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'thabo@example.com');
  await fireEvent.changeText(screen.getByLabelText('Contact number'), '082 555 0100');
}

describe('preferred contact method', () => {
  it.each(['Phone', 'Email', 'WhatsApp'])('selecting %s only updates the form — no URL, intent or share sheet', async (method) => {
    routes();
    await renderScreen(<QuoteScreen />);
    await goToLocationStep();
    const option = screen.getByRole('radio', { name: method });
    await fireEvent.press(option);
    await fireEvent(option, 'longPress');
    expect(screen.getByRole('radio', { name: method })).toBeChecked();
    expect(openURL).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it('the chosen method is submitted as enquiry data', async () => {
    const api = routes();
    await renderScreen(<QuoteScreen />);
    await goToLocationStep();
    await fillContact();
    await fireEvent.press(screen.getByRole('radio', { name: 'WhatsApp' }));
    await fireEvent.press(screen.getByText('Continue to Submit'));
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Submit Quotation Request'));
    await waitFor(() => expect(screen.getByText('ENQ-000777')).toBeOnTheScreen());
    const body = api.find('POST', '/contact-queries')[0]!.body as { details: { preferredContact: string } };
    expect(body.details.preferredContact).toBe('WHATSAPP');
    expect(openURL).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });
});

describe('guest RFQ wizard', () => {
  it('Back and Next keep everything entered; validation blocks incomplete steps', async () => {
    routes();
    await renderScreen(<QuoteScreen />);
    await goToLocationStep();
    await fireEvent.press(screen.getByText('Continue to Submit'));
    expect(screen.getByText('Enter the site address')).toBeOnTheScreen();
    expect(screen.getByText('Enter a valid email address')).toBeOnTheScreen();
    await fillContact();
    await fireEvent.press(screen.getByRole('radio', { name: 'Email' }));
    await fireEvent.press(screen.getByText('Back'));
    expect(screen.getByLabelText('Scope brief')).toHaveDisplayValue('Roof-mounted 10 kVA hybrid system with battery');
    await fireEvent.press(screen.getByText('Continue to Location'));
    expect(screen.getByLabelText('Site address')).toHaveDisplayValue('14 Marine Drive, Umhlanga');
    expect(screen.getByLabelText('Full name')).toHaveDisplayValue('Thabo Guest');
    expect(screen.getByRole('radio', { name: 'Email' })).toBeChecked();
  });

  it('submits a lead enquiry (never a job), shows the reference, and a double tap sends once', async () => {
    // Hold every POST until both taps have happened, as on a slow phone network.
    const held: (() => void)[] = [];
    const api = routes();
    const fetchMock = global.fetch as jest.Mock;
    const real = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init: { method?: string }) =>
      init?.method === 'POST' ? new Promise((r) => held.push(() => r(real(url, init)))) : real(url, init),
    );
    const release = () => held.splice(0).forEach((go) => go());
    await renderScreen(<QuoteScreen />);
    await goToLocationStep();
    await fillContact();
    await fireEvent.press(screen.getByText('Continue to Submit'));
    await fireEvent.press(screen.getByRole('checkbox'));
    await pressTwiceSameFrame(screen.getByText('Submit Quotation Request'));
    await act(async () => release());
    await waitFor(() => expect(screen.getByText('ENQ-000777')).toBeOnTheScreen());
    expect(api.find('POST', '/contact-queries')).toHaveLength(1);
    expect(api.find('POST', '/jobs')).toHaveLength(0);
    expect(screen.getByText('Quotation request received')).toBeOnTheScreen();
  });

  it('an API failure keeps the whole draft so the user can retry', async () => {
    routes({ 'POST /contact-queries': () => apiError(503, 'UNAVAILABLE', 'Service temporarily unavailable') });
    await renderScreen(<QuoteScreen />);
    await goToLocationStep();
    await fillContact();
    await fireEvent.press(screen.getByText('Continue to Submit'));
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Submit Quotation Request'));
    await waitFor(() => expect(lastToast()).toBe('Service temporarily unavailable'));
    expect(screen.getByText('Submit Quotation Request')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Back'));
    expect(screen.getByLabelText('Site address')).toHaveDisplayValue('14 Marine Drive, Umhlanga');
  });
});

describe('external action builders', () => {
  it('tel, mailto and WhatsApp URLs', () => {
    expect(telUrl('+27 (11) 987-6500')).toBe('tel:+27119876500');
    expect(mailtoUrl(' office@psg.co.za ', 'Your enquiry ENQ-1')).toBe('mailto:office@psg.co.za?subject=Your%20enquiry%20ENQ-1');
    expect(whatsappUrl('082 000 0002', 'Hi')).toBe('https://wa.me/27820000002?text=Hi');
    expect(whatsappUrl('+27 82 000 0002')).toBe('https://wa.me/27820000002');
  });

  it('directions use the record’s own coordinates, else its address, else nothing', () => {
    expect(directionsUrl({ latitude: -29.72, longitude: 31.06, address: 'ignored' }, 'android')).toBe('https://www.google.com/maps/dir/?api=1&destination=-29.72,31.06');
    expect(directionsUrl({ latitude: null, longitude: null, address: '1 Main Rd, Durban' }, 'ios')).toBe('https://maps.apple.com/?daddr=1%20Main%20Rd%2C%20Durban');
    expect(directionsUrl({ latitude: 0, longitude: 0, address: '2 Side St' }, 'android')).toContain('2%20Side%20St');
    expect(directionsUrl({ latitude: 999, longitude: 31, address: '' }, 'android')).toBeNull();
    expect(directionsUrl({ address: '   ' }, 'android')).toBeNull();
    // Two different jobs never share a destination.
    expect(directionsUrl({ address: 'Job A site' })).not.toBe(directionsUrl({ address: 'Job B site' }));
  });

  it('a missing handler or missing data shows a message instead of throwing', async () => {
    openURL.mockRejectedValueOnce(new Error('No Activity found to handle Intent'));
    await expect(openExternal('tel:0110000000', 'Dial 011 000 0000.')).resolves.toBe(false);
    expect(lastToast()).toBe('Dial 011 000 0000.');
    await expect(openDirections({ address: null })).resolves.toBe(false);
    expect(lastToast()).toBe('No address or location is recorded for this site.');
    expect(share).not.toHaveBeenCalled();
  });
});
