/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
/**
 * Owner-confirmed contact details (2 November 2026): both phone numbers and both email addresses are
 * shown and actionable, WhatsApp opens the official number, hours are Monday–Friday 07:00–18:00, and no
 * office or department listings (which an older database may still hold) are shown.
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import ContactScreen from '../app/(public)/(tabs)/contact';
import CustomerAccount from '../app/customer/(tabs)/profile';
import EmployeeMore from '../app/employee/(tabs)/profile';
import { PSG_CONTACT } from '../content/company';
import { mockApi, renderScreen, renderedText, signInAs, signOutState } from '../test-utils';

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

let openURL: jest.SpyInstance;
let api: ReturnType<typeof mockApi>;
beforeEach(() => {
  signOutState();
  (router.push as jest.Mock).mockClear();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  api = mockApi({
    'GET /faqs': () => [],
    'GET /notifications': () => ({ items: [], unread: 0 }),
    // What a database seeded before Part 3 still returns.
    'GET /offices': () => [{ id: 'o1', region: 'Gauteng', name: 'Gauteng Main HQ', area: 'Sandton', address: '14 Commerce Crescent', phone: '+27 (11) 987-6500', email: 'jhb@psg.test', manager: 'Eng. J', hours: 'Mon-Fri | 24/7 Hotline', latitude: 0, longitude: 0 }],
    'GET /departments': () => [{ id: 'd1', name: '24/7 Emergency Technical Support', email: 'x@psg.test', phone: '+27 (800) 911-911', sla: 'Immediate Rapid Dispatch', icon: 'siren' }],
    'GET /public-content': () => ({ company: { name: 'PSG', tagline: '', hotline: '+27 11 987 6500', emergencyLine: '+27 800 911 911', whatsapp: '+27 11 987 6500', email: 'x@psg.test', established: 2008 }, metrics: [], accreditations: [], certifications: [], testimonial: null, isDemoContent: true }),
  });
});
afterEach(() => openURL.mockRestore());

describe('owner-confirmed details', () => {
  it('are the values the owner supplied', () => {
    expect(PSG_CONTACT.phones).toEqual([{ label: 'Ricky', number: '082 603 9283' }, { label: 'Keoran', number: '072 752 0848' }]);
    expect(PSG_CONTACT.emails.map((e) => e.address)).toEqual(['info@psgelectrical.co.za', 'trite@polka.co.za']);
    expect(PSG_CONTACT.whatsapp).toBe('082 603 9283');
    expect(PSG_CONTACT.hours).toBe('Monday–Friday, 07:00–18:00');
  });
});

describe('contact screen', () => {
  it.each([
    ['Call Ricky on 082 603 9283', 'tel:0826039283'],
    ['Call Keoran on 072 752 0848', 'tel:0727520848'],
  ])('%s opens the dialer', async (label, url) => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    await fireEvent.press(screen.getByRole('link', { name: label }));
    expect(openURL).toHaveBeenCalledWith(url);
  });

  it.each([
    ['Email General enquiries at info@psgelectrical.co.za', 'mailto:info@psgelectrical.co.za?subject=Enquiry%20from%20the%20PSG%20app'],
    ['Email Solar (Trite Solar) at trite@polka.co.za', 'mailto:trite@polka.co.za?subject=Enquiry%20from%20the%20PSG%20app'],
  ])('%s opens the mail app', async (label, url) => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    await fireEvent.press(screen.getByRole('link', { name: label }));
    expect(openURL).toHaveBeenCalledWith(url);
  });

  it('WhatsApp opens the official number in international format, with an encoded greeting', async () => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    await fireEvent.press(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(openURL).toHaveBeenCalledWith(`https://wa.me/27826039283?text=${encodeURIComponent('Hello PSG Electrical, I would like assistance with…')}`);
  });

  it('shows Monday–Friday hours and no weekend, after-hours or 24/7 promise', async () => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    expect(screen.getByTestId('contact-hours')).toHaveTextContent('Office hours: Monday–Friday, 07:00–18:00');
    expect(renderedText(screen.toJSON())).not.toMatch(/24\/7|around the clock|weekends? (service|available)|immediate (dispatch|response|attention)/i);
  });

  it('never lists regional offices or department desks, even when an older database returns them', async () => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    expect(renderedText(screen.toJSON())).not.toMatch(/Gauteng Main HQ|Emergency Technical Support|987-6500|911-911|Sandton/);
    expect(api.find('GET', '/offices')).toHaveLength(0);
    expect(api.find('GET', '/departments')).toHaveLength(0);
  });
});

describe('contact details from the signed-in interfaces', () => {
  it('customers reach the contact page from Account', async () => {
    signInAs('CUSTOMER');
    const { client } = await renderScreen(<CustomerAccount />);
    await settle(client);
    await fireEvent.press(screen.getByRole('button', { name: 'Contact PSG' }));
    expect(router.push).toHaveBeenCalledWith('/contact');
  });

  it('electricians reach the contact page from More', async () => {
    signInAs('EMPLOYEE');
    const { client } = await renderScreen(<EmployeeMore />);
    await settle(client);
    await fireEvent.press(screen.getByRole('button', { name: 'Contact the office' }));
    expect(router.push).toHaveBeenCalledWith('/contact');
  });
});
