/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Part 3 sign-in / welcome redesign: photo removed, clear order (logo → welcome → sign in →
 * create account / guest) and every existing auth pathway still present.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import LoginScreen from '../app/(auth)/login';
import Welcome from '../app/welcome';
import { useAuth } from '../store/auth';
import { apiError, mockApi, renderScreen, signOutState } from '../test-utils';

/** Position of a rendered string/testID in the tree, for checking top-to-bottom reading order. */
const positionOf = (needle: string) => JSON.stringify(screen.toJSON()).indexOf(needle);

beforeEach(() => {
  signOutState();
  mockApi({});
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
});

describe('welcome gateway', () => {
  it('has no photograph; brand, welcome and actions appear in that order', async () => {
    expect(readFileSync(join(__dirname, '../app/welcome.tsx'), 'utf8')).not.toMatch(/imageFor|expo-image/);
    await renderScreen(<Welcome />);
    expect(screen.getByTestId('brand-logo')).toBeOnTheScreen();
    // Decorative: hidden from screen readers, so it is only found when hidden elements are included.
    expect(screen.getByTestId('brand-backdrop', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('brand-backdrop')).toBeNull();
    const positions = ['"PSG Electrical & Cables"', '"Welcome"', '"welcome-sign-in"', '"welcome-register"', '"welcome-guest"'].map(positionOf);
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('Sign In, Create Account and Continue as Guest go to the existing routes', async () => {
    await renderScreen(<Welcome />);
    await fireEvent.press(screen.getByTestId('welcome-sign-in'));
    expect(router.push).toHaveBeenCalledWith('/login');
    await fireEvent.press(screen.getByTestId('welcome-register'));
    expect(router.push).toHaveBeenCalledWith('/register');
    await fireEvent.press(screen.getByTestId('welcome-guest'));
    expect(useAuth.getState().guest).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('makes no 24/7 or certification claims', async () => {
    await renderScreen(<Welcome />);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/24\/7|ISO|accredit|certified/i);
  });
});

describe('sign-in screen', () => {
  it('keeps every pathway: sign in, forgot password, create account, guest and Google', async () => {
    await renderScreen(<LoginScreen />);
    expect(screen.getByTestId('brand-logo')).toBeOnTheScreen();
    expect(screen.getByTestId('login-identifier')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('login-submit')).toBeOnTheScreen();
    expect(screen.getByText('Forgot password?')).toBeOnTheScreen();
    expect(screen.getByTestId('login-register')).toBeOnTheScreen();
    expect(screen.getByTestId('login-guest')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Google/ })).toBeOnTheScreen();
  });

  it('create account and guest sit directly under Sign in, before the Google option', async () => {
    await renderScreen(<LoginScreen />);
    expect(positionOf('"login-submit"')).toBeLessThan(positionOf('"login-register"'));
    expect(positionOf('"login-register"')).toBeLessThan(positionOf('"login-guest"'));
    expect(positionOf('"login-guest"')).toBeLessThan(positionOf('Google'));
  });

  it('staff sign-in hides self-registration but keeps guest browsing', async () => {
    await renderScreen(<LoginScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Staff sign in' }));
    expect(screen.queryByTestId('login-register')).toBeNull();
    expect(screen.getByTestId('login-guest')).toBeOnTheScreen();
  });

  it('shows validation and API errors without leaving the screen', async () => {
    mockApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password') });
    await renderScreen(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(router.replace).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('login-identifier'), 'thandi@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrong-password-123');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent('Incorrect email or password'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Continue as guest from sign-in opens the public site', async () => {
    await renderScreen(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-guest'));
    expect(useAuth.getState().guest).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/home');
  });
});
