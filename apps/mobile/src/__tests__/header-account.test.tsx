import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions } from 'react-native';
import { BrandHeader } from '../components/layout';
import { useAuth } from '../store/auth';
import { mockApi, renderScreen, signInAs, signOutState } from '../test-utils';

function setWidth(width: number) {
  Dimensions.set({ window: { width, height: 780, scale: 3, fontScale: 1 }, screen: { width, height: 780, scale: 3, fontScale: 1 } });
}

beforeEach(() => {
  mockApi({ 'GET /notifications': () => ({ items: [], page: 1, pageSize: 1, total: 0, unread: 3 }) });
  setWidth(412);
});

describe('public header account affordance', () => {
  it('guests always have Sign In and Create Account one tap away', async () => {
    signOutState();
    await renderScreen(<BrandHeader section="Home" />);
    await fireEvent.press(screen.getByTestId('header-account'));
    await fireEvent.press(screen.getByTestId('menu-sign-in'));
    expect(router.push).toHaveBeenCalledWith('/login');
    await fireEvent.press(screen.getByTestId('header-account'));
    await fireEvent.press(screen.getByTestId('menu-register'));
    expect(router.push).toHaveBeenCalledWith('/register');
  });

  it('signed-in users get their dashboard, notifications, profile and sign out', async () => {
    signInAs('EMPLOYEE');
    await renderScreen(<BrandHeader section="Today" />);
    expect(await screen.findByLabelText('Account menu for Sipho, 3 unread notifications')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('header-account'));
    expect(screen.getByText('My workday')).toBeOnTheScreen();
    expect(screen.getByLabelText('Notifications, 3')).toBeOnTheScreen();
    expect(screen.getByText('Profile & settings')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('menu-dashboard'));
    expect(router.push).toHaveBeenCalledWith('/employee');
  });

  it('sign out from the account menu confirms, ends the session and returns to the gateway', async () => {
    mockApi({ 'POST /auth/logout': () => ({}), 'GET /notifications': () => ({ items: [], unread: 0 }) });
    signInAs('CUSTOMER');
    await renderScreen(<BrandHeader section="My Dashboard" />);
    await fireEvent.press(screen.getByTestId('header-account'));
    await fireEvent.press(screen.getByTestId('menu-sign-out'));
    expect(await screen.findByText('Sign out?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(useAuth.getState().status).toBe('signedOut'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('responsive brand header', () => {
  it('keeps the full brand and all actions on a narrow 360dp Android phone', async () => {
    setWidth(360);
    signOutState();
    await renderScreen(<BrandHeader section="Home" />);
    expect(screen.getByText('PSG Electrical')).toBeOnTheScreen();
    expect(screen.getByText('& Cables · South Africa')).toBeOnTheScreen();
    // Emergency collapses to its icon but stays a labelled, tappable action.
    expect(screen.getByLabelText('Emergency: call the 24/7 line')).toBeOnTheScreen();
    expect(screen.queryByText('Emergency')).toBeNull();
    expect(screen.getByLabelText('Call PSG Electrical')).toBeOnTheScreen();
    expect(screen.getByTestId('header-account')).toBeOnTheScreen();
  });

  it('shows the Emergency label and PRO mark when there is room', async () => {
    setWidth(430);
    signOutState();
    await renderScreen(<BrandHeader section="Home" />);
    expect(screen.getByText('Emergency')).toBeOnTheScreen();
    expect(screen.getByText('PRO')).toBeOnTheScreen();
  });

  it('never ellipsises the brand name to a single line', async () => {
    setWidth(320);
    signOutState();
    await renderScreen(<BrandHeader section="A very long section title for a narrow phone" />);
    expect(screen.getByText('PSG Electrical').props.numberOfLines).toBeGreaterThan(1);
    expect(screen.getByText('& Cables · South Africa').props.numberOfLines).toBeGreaterThan(1);
  });
});

describe('header at every common phone width', () => {
  it.each([320, 360, 390, 412, 430])('%ddp: brand, emergency, call and account are all present and labelled (signed in)', async (width) => {
    setWidth(width);
    signInAs('CUSTOMER', { firstName: 'Lerato', lastName: 'Khumalo' });
    await renderScreen(<BrandHeader section="My Dashboard" />);
    expect(screen.getByText('PSG Electrical')).toBeOnTheScreen();
    expect(screen.getByLabelText('Emergency: call the 24/7 line')).toBeOnTheScreen();
    expect(screen.getByLabelText('Call PSG Electrical')).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Account menu for Lerato/)).toBeOnTheScreen();
    expect(screen.getByText('LK')).toBeOnTheScreen();
  });

  it('initials follow a name change immediately', async () => {
    signInAs('ADMIN_OFFICE', { firstName: 'Priya', lastName: 'Naidoo' });
    await renderScreen(<BrandHeader section="Operations" />);
    expect(screen.getByText('PN')).toBeOnTheScreen();
    await waitFor(() => useAuth.getState().setUser({ ...useAuth.getState().user!, firstName: 'Zanele', lastName: 'Dube' }));
    expect(await screen.findByText('ZD')).toBeOnTheScreen();
  });
});
