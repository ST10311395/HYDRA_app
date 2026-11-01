/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import Welcome from '../app/welcome';
import { AuthShell } from '../components/AuthShell';
import { BootSplash } from '../components/BootSplash';
import { BrandLogo } from '../components/BrandLogo';
import { BrandHeader } from '../components/layout';
import { mockApi, renderScreen, signOutState } from '../test-utils';

beforeEach(() => {
  mockApi({ 'GET /notifications': () => ({ items: [], page: 1, pageSize: 1, total: 0, unread: 0 }) });
  signOutState();
});

describe('PSG brand mark', () => {
  it.each([
    ['header', <BrandHeader key="h" section="Home" />],
    ['sign-in shell', <AuthShell key="a" title="Sign in" subtitle="Welcome back"><Text>form</Text></AuthShell>],
    ['boot splash', <BootSplash key="b" />],
    ['welcome', <Welcome key="w" />],
  ])('the %s shows the PSG logo', async (_name, ui) => {
    await renderScreen(ui);
    expect(screen.getAllByTestId('brand-logo').length).toBeGreaterThanOrEqual(1);
  });

  it('is announced once as the company logo when it is not decorative', async () => {
    await renderScreen(<BrandLogo />);
    expect(screen.getByLabelText('PSG Electrical & Cables logo')).toBeOnTheScreen();
  });

  it('brand surfaces no longer use the generic lightning icon as the company mark', () => {
    for (const file of ['components/layout.tsx', 'components/AuthShell.tsx', 'components/BootSplash.tsx', 'app/welcome.tsx']) {
      expect(readFileSync(join(__dirname, '..', file), 'utf8')).not.toMatch(/name="zap"/);
    }
  });
});
