/** A crash in one screen shows the branded recovery screen for that area, not a dead app (§35). */
import { Stack } from 'expo-router';
import { cleanup, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';
import { signInAs } from '../test-utils';

jest.unmock('expo-router');

let explode = true;
function Fragile() {
  if (explode) throw new Error('Cannot read properties of undefined (reading "status")');
  return <Text>Recovered screen</Text>;
}
const ChildStack = () => <Stack screenOptions={{ headerShown: false }} />;

afterEach(async () => {
  await cleanup();
});

it('contains the failure, shows diagnostics in development and recovers on Try again', async () => {
  signInAs('CUSTOMER');
  explode = true;
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await renderRouter(
    { _layout: ChildStack, 'customer/_layout': { default: ChildStack, ErrorBoundary: RouteErrorBoundary }, 'customer/index': Fragile },
    { initialUrl: '/customer' },
  );
  expect(screen.getByTestId('route-error-boundary')).toBeOnTheScreen();
  expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
  expect(screen.getAllByText(/reading "status"/).length).toBeGreaterThan(0);
  expect(screen.getByText('Return to dashboard')).toBeOnTheScreen();
  explode = false;
  await fireEvent.press(screen.getByTestId('error-retry'));
  expect(await screen.findByText('Recovered screen')).toBeOnTheScreen();
  spy.mockRestore();
});
