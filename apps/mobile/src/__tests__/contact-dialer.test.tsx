/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
/**
 * Header call button (Part 3, client screenshot IMG-20261022-WA0003): it must open the phone dialer
 * with the verified PSG number. Linking is stubbed, so no real call is ever placed.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { PSG_CONTACT } from '../content/company';
import { BrandHeader } from '../components/layout';
import { callNumber, isDialable } from '../utils/links';
import { lastToast, mockApi, renderScreen, signInAs, signOutState } from '../test-utils';

let openURL: jest.SpyInstance;
beforeEach(() => {
  mockApi({ 'GET /notifications': () => ({ items: [], page: 1, pageSize: 1, total: 0, unread: 0 }) });
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => openURL.mockRestore());

describe('header call button', () => {
  it.each([
    ['a guest', () => signOutState()],
    ['a signed-in customer', () => signInAs('CUSTOMER')],
  ])('dials the verified business line for %s', async (_who, setup) => {
    setup();
    await renderScreen(<BrandHeader section="Home" />);
    await fireEvent.press(screen.getByLabelText('Call PSG Electrical on 082 603 9283'));
    expect(openURL).toHaveBeenCalledWith('tel:0826039283');
  });

  it('does not depend on seeded content: dials even when the content API is unavailable', async () => {
    signOutState();
    mockApi({});
    await renderScreen(<BrandHeader section="Home" />);
    await fireEvent.press(screen.getByLabelText(/^Call PSG Electrical/));
    expect(openURL).toHaveBeenCalledWith('tel:0826039283');
  });

  it('shows the number when the device has no dialer', async () => {
    signOutState();
    openURL.mockRejectedValueOnce(new Error('No Activity found to handle Intent'));
    await renderScreen(<BrandHeader section="Home" />);
    await fireEvent.press(screen.getByLabelText(/^Call PSG Electrical/));
    await waitFor(() => expect(lastToast()).toBe('Calling isn’t available on this device. Dial 082 603 9283.'));
  });
});

describe('callNumber', () => {
  it('uses the verified numbers from the website and portfolio', () => {
    expect(PSG_CONTACT.primaryPhone).toBe('082 603 9283');
    expect(PSG_CONTACT.phones.map((p) => p.number)).toEqual(['082 603 9283', '072 752 0848']);
  });

  it('rejects blanks and fragments instead of opening an empty dialer', async () => {
    expect(isDialable('082 603 9283')).toBe(true);
    expect(isDialable('+27 82 603 9283')).toBe(true);
    expect(isDialable('ext 12')).toBe(false);
    expect(isDialable('')).toBe(false);
    await expect(callNumber('  ')).resolves.toBe(false);
    expect(openURL).not.toHaveBeenCalled();
    expect(lastToast()).toBe('No phone number on record.');
  });

  it('on the web also shows the number, since desktop browsers may have no dialer', async () => {
    await expect(callNumber('072 752 0848', 'web')).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith('tel:0727520848');
    expect(lastToast()).toBe('Call 072 752 0848');
  });
});
