/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
/**
 * Part 3 responsive and accessibility polish: guests still learn what PSG does when the API is
 * unreachable, and contact / footer links meet the 44pt minimum touch target.
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import ContactScreen from '../app/(public)/(tabs)/contact';
import HomeScreen from '../app/(public)/(tabs)/home';
import ServicesScreen from '../app/(public)/(tabs)/services';
import WorkScreen from '../app/(public)/(tabs)/work';
import { BrandHeader } from '../components/layout';
import { HIT } from '../design-system';
import { apiError, mockApi, renderScreen, signOutState } from '../test-utils';

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function setWidth(width: number, fontScale = 1) {
  Dimensions.set({ window: { width, height: 780, scale: 3, fontScale }, screen: { width, height: 780, scale: 3, fontScale } });
}

const minHeightOf = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as never) as { minHeight?: number } | undefined)?.minHeight ?? 0;

beforeEach(() => {
  signOutState();
  setWidth(412);
});

describe('when the API cannot be reached', () => {
  beforeEach(() => {
    mockApi({
      'GET /service-types': () => apiError(503, 'UNAVAILABLE', 'Service temporarily unavailable'),
      'GET /portfolio': () => apiError(503, 'UNAVAILABLE', 'Service temporarily unavailable'),
      'GET /public-content': () => apiError(503, 'UNAVAILABLE', 'Service temporarily unavailable'),
      'GET /notifications': () => ({ items: [], unread: 0 }),
    });
  });

  it('Services still lists what PSG does, with a retry', async () => {
    const { client } = await renderScreen(<ServicesScreen />);
    await settle(client);
    expect(screen.getByRole('button', { name: /Try again/ })).toBeOnTheScreen();
    expect(screen.getByTestId('service-overview')).toBeOnTheScreen();
  });

  it('Work still shows the industries PSG serves, with a retry', async () => {
    const { client } = await renderScreen(<WorkScreen />);
    await settle(client);
    expect(screen.getByRole('button', { name: /Try again/ })).toBeOnTheScreen();
    expect(screen.getByTestId('sector-list')).toBeOnTheScreen();
  });

  it('Home still shows the hero, call action and service overview', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    expect(screen.getByTestId('home-hero')).toBeOnTheScreen();
    expect(screen.getByTestId('home-call')).toBeOnTheScreen();
    expect(screen.getByTestId('service-overview')).toBeOnTheScreen();
  });
});

describe('touch targets', () => {
  beforeEach(() => mockApi({ 'GET /notifications': () => ({ items: [], unread: 0 }), 'GET /service-types': () => [], 'GET /portfolio': () => [] }));

  it('contact phone and email rows are at least 44pt tall', async () => {
    const { client } = await renderScreen(<ContactScreen />);
    await settle(client);
    for (const name of ['Call main line 082 603 9283', 'Call second line 072 752 0848']) {
      expect(minHeightOf(screen.getByRole('link', { name }))).toBeGreaterThanOrEqual(HIT);
    }
  });

  it('footer About links are at least 44pt tall', async () => {
    const { client } = await renderScreen(<HomeScreen />);
    await settle(client);
    for (const name of ['Why PSG', 'Our team', 'Partners', 'FAQ']) {
      expect(minHeightOf(screen.getByRole('link', { name }))).toBeGreaterThanOrEqual(HIT);
    }
  });
});

describe('narrow phones and large text', () => {
  it.each([320, 360])('at %ddp with 1.6× text the header keeps the full name and both actions', async (width) => {
    setWidth(width, 1.6);
    mockApi({ 'GET /notifications': () => ({ items: [], unread: 0 }) });
    await renderScreen(<BrandHeader section="A long section title for a small phone" />);
    expect(screen.getByText('PSG Electrical').props.numberOfLines).toBeGreaterThan(1);
    expect(screen.getByLabelText('Call PSG Electrical on 082 603 9283')).toBeOnTheScreen();
    expect(screen.getByTestId('header-account')).toBeOnTheScreen();
  });
});
