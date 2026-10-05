import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { BootSplash } from '../components/BootSplash';
import { ConfirmHost, ToastHost, colors } from '../design-system';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useRealtime } from '../hooks/useRealtime';
import { AppStack } from '../navigation/AppStack';
import { onSignOut, useAuth } from '../store/auth';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';

void SplashScreen.preventAutoHideAsync();

onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 3_600_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

/**
 * Offline cache (spec §20): only public content and the electrician's own schedule/jobs are
 * persisted to device storage — never tokens, invoices or payment data — and it is wiped on sign-out.
 */
const PERSISTED = new Set(['public-content', 'service-types', 'portfolio', 'faqs', 'offices', 'departments', 'schedules', 'job']);
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'hydra.query-cache.v1', throttleTime: 2000 });

onSignOut(() => {
  queryClient.clear();
  void AsyncStorage.removeItem('hydra.query-cache.v1');
});

const THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, primary: colors.primary, text: colors.text, border: colors.border },
};

function Session() {
  useRealtime();
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  const status = useAuth((s) => s.status);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    void useAuth.getState().bootstrap();
  }, []);

  const ready = fontsLoaded && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  // Native keeps the OS splash up until ready; web (no native splash) shows the branded one.
  if (!ready) return <BootSplash />;

  const signedIn = status === 'signedIn';
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 3_600_000,
            dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])) },
          }}
        >
          <ThemeProvider value={THEME}>
            <StatusBar style="light" />
            {signedIn ? <Session /> : null}
            <AppStack />
            <ToastHost />
            <ConfirmHost />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** A crash in one screen shows a branded recovery screen for this area instead of taking down the app. */
export const ErrorBoundary = RouteErrorBoundary;
