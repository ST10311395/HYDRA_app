import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AuthSession } from '@hydra/shared';
import { ApiError, api, errorMessage } from '../api/client';
import { homeForRole, useAuth } from '../store/auth';
import { apiError, makeUser, mockApi, respond, signOutState } from '../test-utils';

const session = (n = 1): AuthSession => ({
  user: makeUser('CUSTOMER'),
  accessToken: `access-${n}`,
  accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: '2030-01-01T00:00:00Z',
});

beforeEach(() => {
  signOutState();
  jest.clearAllMocks();
});

describe('auth store (spec §6.3 token handling)', () => {
  it('keeps the refresh token only in SecureStore, never AsyncStorage', async () => {
    await useAuth.getState().setSession(session());
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('hydra.refreshToken', 'refresh-1', expect.any(Object));
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', accessToken: 'access-1' });
  });

  it('bootstrap restores a session through the rotating refresh endpoint', async () => {
    await SecureStore.setItemAsync('hydra.refreshToken', 'refresh-1');
    const m = mockApi({ 'POST /auth/refresh': () => session(2) });
    await useAuth.getState().bootstrap();
    expect(m.find('POST', '/auth/refresh')[0]?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(await SecureStore.getItemAsync('hydra.refreshToken')).toBe('refresh-2');
    expect(useAuth.getState().status).toBe('signedIn');
  });

  it('bootstrap signs out and discards a rejected refresh token', async () => {
    await SecureStore.setItemAsync('hydra.refreshToken', 'stolen');
    mockApi({ 'POST /auth/refresh': () => apiError(401, 'TOKEN_REUSED', 'Session revoked') });
    await useAuth.getState().bootstrap();
    expect(useAuth.getState().status).toBe('signedOut');
    expect(await SecureStore.getItemAsync('hydra.refreshToken')).toBeNull();
  });

  it('signOut revokes remotely and clears the keystore', async () => {
    await useAuth.getState().setSession(session());
    const m = mockApi({ 'POST /auth/logout': () => respond(204) });
    await useAuth.getState().signOut();
    expect(m.find('POST', '/auth/logout')[0]?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(await SecureStore.getItemAsync('hydra.refreshToken')).toBeNull();
    expect(useAuth.getState()).toMatchObject({ status: 'signedOut', user: null, accessToken: null });
  });

  it('routes each role to its own home', () => {
    expect(homeForRole('CUSTOMER')).toBe('/customer');
    expect(homeForRole('EMPLOYEE')).toBe('/employee');
    expect(homeForRole('ADMIN_OFFICE')).toBe('/admin');
    expect(homeForRole('ADMIN_OWNER')).toBe('/admin');
    expect(homeForRole(undefined)).toBe('/');
  });
});

describe('API client', () => {
  it('sends the bearer token and parses JSON', async () => {
    await useAuth.getState().setSession(session());
    const m = mockApi({ 'GET /jobs': () => ({ items: [], page: 1, pageSize: 20, total: 0 }) });
    await api.get('/jobs', { status: 'REQUESTED', search: '' });
    expect(m.calls[0]?.headers.Authorization).toBe('Bearer access-1');
    expect(m.calls[0]?.query).toEqual({ status: 'REQUESTED' });
  });

  it('refreshes once on 401 and retries (single-flight across parallel requests)', async () => {
    await useAuth.getState().setSession(session());
    let refreshes = 0;
    mockApi({
      'POST /auth/refresh': () => {
        refreshes += 1;
        return session(2);
      },
      'GET /jobs/:id': (c) => (c.headers.Authorization === 'Bearer access-2' ? { id: 'ok' } : apiError(401, 'TOKEN_EXPIRED', 'expired')),
    });
    const results = await Promise.all([api.get<{ id: string }>('/jobs/a'), api.get<{ id: string }>('/jobs/b'), api.get<{ id: string }>('/jobs/c')]);
    expect(results.map((r) => r.id)).toEqual(['ok', 'ok', 'ok']);
    expect(refreshes).toBe(1);
  });

  it('turns API errors into ApiError with field errors and never leaks raw details', async () => {
    mockApi({
      'POST /jobs': () => respond(422, { error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details: [{ path: 'siteAddress', message: 'Too short' }], requestId: 'req-1' } }),
    });
    const err = await api.post('/jobs', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).fieldErrors()).toEqual({ siteAddress: 'Too short' });
    expect(errorMessage(err)).toBe('Please check the highlighted fields');
    expect(errorMessage(new TypeError('x is undefined'))).toBe('Something went wrong. Please try again.');
  });

  it('reports offline as a friendly NETWORK error', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const err = (await api.get('/jobs').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('NETWORK');
    expect(err.message).toMatch(/offline/i);
  });
});
