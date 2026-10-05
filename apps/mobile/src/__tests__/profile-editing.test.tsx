/**
 * Self-service profile editing for every role (physical-phone review: edits appeared to save but
 * did not persist). The fake API below is stateful — a PATCH changes what the next GET returns —
 * so "persisted" is always asserted by re-reading from the server, never from local form state.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AuthUser, Role } from '@hydra/shared';
import { ProfileScreen, profileChanges, profileFormFrom } from '../features/ProfileScreen';
import { useAuth } from '../store/auth';
import { apiError, lastToast, makeUser, mockApi, renderScreen, respond, pressTwiceSameFrame, signInAs } from '../test-utils';

const ROLES: [string, Role][] = [
  ['customer', 'CUSTOMER'],
  ['employee', 'EMPLOYEE'],
  ['office admin', 'ADMIN_OFFICE'],
  ['owner', 'ADMIN_OWNER'],
];

const EDITABLE = ['firstName', 'lastName', 'phone', 'address', 'marketingOptIn'];

/** Stateful fake of GET/PATCH /profile with the server's allowed-field rule. */
function fakeServer(role: Role, initial: Partial<AuthUser> = {}, opts: { failPatch?: () => unknown } = {}) {
  const db: { user: AuthUser } = { user: makeUser(role, { firstName: 'Server', lastName: 'Copy', phone: '+27 82 111 2222', ...initial }) };
  const api = mockApi({
    'GET /profile': () => db.user,
    'PATCH /profile': (c) => {
      if (opts.failPatch) return opts.failPatch();
      const body = c.body as Record<string, unknown>;
      const allowed = role === 'CUSTOMER' ? EDITABLE : EDITABLE.slice(0, 3);
      const bad = Object.keys(body).filter((k) => !allowed.includes(k));
      if (bad.length) return respond(422, { error: { code: 'VALIDATION_FAILED', message: 'Some fields need attention', details: bad.map((path) => ({ path, message: 'Not editable' })) } });
      db.user = { ...db.user, ...(body as Partial<AuthUser>), ...(body.address === '' ? { address: null } : {}) };
      return db.user;
    },
    'GET /notifications/unread-count': () => ({ unread: 0 }),
    'GET /notifications': () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
    'GET /public-content': () => ({ company: { hotline: '011 000 0000', emergencyLine: '011 000 0001' } }),
  });
  return { db, api };
}

async function openEditor() {
  await waitFor(() => expect(screen.getByTestId('profile-edit')).toBeEnabled());
  await fireEvent.press(screen.getByTestId('profile-edit'));
}

beforeEach(() => {
  useAuth.setState({ status: 'signedOut', user: null, accessToken: null });
});

describe.each(ROLES)('%s profile', (_label, role) => {
  it('loads persisted values from the API, saves only changed fields, and a fresh mount re-reads the saved data', async () => {
    signInAs(role, { firstName: 'Stale', lastName: 'Session' });
    const { db, api } = fakeServer(role);
    const first = await renderScreen(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('profile-name')).toHaveTextContent('Server Copy'));
    await openEditor();
    expect(screen.getByTestId('profile-first-name')).toHaveDisplayValue('Server');
    expect(screen.getByTestId('profile-save')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('profile-first-name'), 'Naledi');
    await fireEvent.changeText(screen.getByTestId('profile-phone'), '082 555 0199');
    await fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() => expect(lastToast()).toBe('Profile updated'));
    expect(api.find('PATCH', '/profile').map((c) => c.body)).toEqual([{ firstName: 'Naledi', phone: '082 555 0199' }]);
    expect(db.user).toMatchObject({ firstName: 'Naledi', phone: '082 555 0199', role });
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Naledi Copy');
    // Session user (header avatar / initials, greetings) follows immediately.
    expect(useAuth.getState().user).toMatchObject({ firstName: 'Naledi', phone: '082 555 0199' });
    expect(screen.getByLabelText(/Account menu for Naledi/)).toBeOnTheScreen();

    // Leave and come back (e.g. after signing out and in): data comes from a new GET.
    await first.unmount();
    signInAs(role, { firstName: 'Stale', lastName: 'Session' });
    const gets = api.find('GET', '/profile').length;
    await renderScreen(<ProfileScreen />);
    await waitFor(() => expect(api.find('GET', '/profile').length).toBe(gets + 1));
    await waitFor(() => expect(screen.getByTestId('profile-name')).toHaveTextContent('Naledi Copy'));
  });

  it('Cancel discards edits and the next edit starts from the persisted values', async () => {
    signInAs(role);
    const { api } = fakeServer(role);
    await renderScreen(<ProfileScreen />);
    await openEditor();
    await fireEvent.changeText(screen.getByTestId('profile-first-name'), 'Typed but not saved');
    await fireEvent.press(screen.getByTestId('profile-cancel'));
    expect(screen.queryByTestId('profile-first-name')).toBeNull();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Server Copy');
    await openEditor();
    expect(screen.getByTestId('profile-first-name')).toHaveDisplayValue('Server');
    expect(api.find('PATCH', '/profile')).toHaveLength(0);
  });

  it('an API failure keeps the typed values, marks the field and does not claim success', async () => {
    signInAs(role);
    const { db } = fakeServer(role, {}, { failPatch: () => respond(422, { error: { code: 'VALIDATION_FAILED', message: 'Some fields need attention', details: [{ path: 'lastName', message: 'Too long' }] } }) });
    await renderScreen(<ProfileScreen />);
    await openEditor();
    await fireEvent.changeText(screen.getByTestId('profile-last-name'), 'Rejected');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(lastToast()).toBe('Some fields need attention'));
    expect(screen.getByTestId('profile-last-name')).toHaveDisplayValue('Rejected');
    expect(screen.getByText('Too long')).toBeOnTheScreen();
    expect(db.user.lastName).toBe('Copy');
    expect(useAuth.getState().user?.lastName).not.toBe('Rejected');
  });
});

describe('profile save safety', () => {
  it('a network failure keeps the form open with the edits', async () => {
    signInAs('EMPLOYEE');
    fakeServer('EMPLOYEE');
    await renderScreen(<ProfileScreen />);
    await openEditor();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Network request failed');
    });
    await fireEvent.changeText(screen.getByTestId('profile-phone'), '+27 83 000 1234');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(lastToast()).toMatch(/offline or the server is unreachable/));
    expect(screen.getByTestId('profile-phone')).toHaveDisplayValue('+27 83 000 1234');
  });

  it('double-tapping Save sends one request', async () => {
    signInAs('ADMIN_OFFICE');
    const { api } = fakeServer('ADMIN_OFFICE');
    await renderScreen(<ProfileScreen back />);
    await openEditor();
    await fireEvent.changeText(screen.getByTestId('profile-first-name'), 'Once');
    await pressTwiceSameFrame(screen.getByTestId('profile-save'));
    await waitFor(() => expect(lastToast()).toBe('Profile updated'));
    expect(api.find('PATCH', '/profile')).toHaveLength(1);
  });

  it('invalid phone is caught before sending, with a field message', async () => {
    signInAs('CUSTOMER');
    const { api } = fakeServer('CUSTOMER');
    await renderScreen(<ProfileScreen />);
    await openEditor();
    await fireEvent.changeText(screen.getByTestId('profile-phone'), 'call me');
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(screen.getByText('Enter a valid phone number')).toBeOnTheScreen();
    expect(api.find('PATCH', '/profile')).toHaveLength(0);
  });

  it('an untouched empty phone (e.g. Google sign-up) does not block saving the name', async () => {
    signInAs('CUSTOMER');
    const { api } = fakeServer('CUSTOMER', { phone: null });
    await renderScreen(<ProfileScreen />);
    await openEditor();
    await fireEvent.changeText(screen.getByTestId('profile-last-name'), 'Mokoena');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(lastToast()).toBe('Profile updated'));
    expect(api.find('PATCH', '/profile')[0]!.body).toEqual({ lastName: 'Mokoena' });
  });

  it('customer address and marketing consent come from the server and are not reset by a name change', async () => {
    signInAs('CUSTOMER');
    const { api, db } = fakeServer('CUSTOMER', { address: '5 Saved Street', marketingOptIn: true });
    await renderScreen(<ProfileScreen />);
    await openEditor();
    expect(screen.getByTestId('profile-address')).toHaveDisplayValue('5 Saved Street');
    expect(screen.getByRole('checkbox', { name: /safety tips/ })).toBeChecked();
    await fireEvent.changeText(screen.getByTestId('profile-first-name'), 'Lerato');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(lastToast()).toBe('Profile updated'));
    expect(api.find('PATCH', '/profile')[0]!.body).toEqual({ firstName: 'Lerato' });
    expect(db.user.marketingOptIn).toBe(true);
  });

  it('staff never see customer-only fields; email is read-only for everyone', async () => {
    signInAs('EMPLOYEE');
    fakeServer('EMPLOYEE');
    await renderScreen(<ProfileScreen />);
    await openEditor();
    expect(screen.queryByTestId('profile-address')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /safety tips/ })).toBeNull();
    expect(screen.getByText('Email (sign-in) · read-only')).toBeOnTheScreen();
    expect(screen.queryByDisplayValue('employee@hydra.test')).toBeNull();
  });

  it('pure helpers: changes are a trimmed diff limited to the role', () => {
    const u = makeUser('EMPLOYEE', { phone: null });
    const form = { ...profileFormFrom(u), firstName: `  ${u.firstName}  `, address: 'ignored for staff', marketingOptIn: true };
    expect(profileChanges(u, form, 'EMPLOYEE')).toEqual({});
    expect(profileChanges(u, { ...form, lastName: 'New' }, 'EMPLOYEE')).toEqual({ lastName: 'New' });
  });
});

describe('password change', () => {
  it('requires a matching confirmation and a different, 12+ character password before calling the API', async () => {
    signInAs('CUSTOMER');
    const { api } = fakeServer('CUSTOMER');
    await renderScreen(<ProfileScreen />);
    await fireEvent.changeText(screen.getByTestId('pw-current'), 'old-password-123');
    await fireEvent.changeText(screen.getByTestId('pw-new'), 'new-password-456');
    await fireEvent.changeText(screen.getByTestId('pw-confirm'), 'new-password-457');
    await fireEvent.press(screen.getByTestId('pw-submit'));
    expect(screen.getByText('Passwords do not match')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('pw-new'), 'short');
    await fireEvent.press(screen.getByTestId('pw-submit'));
    expect(screen.getByText('At least 12 characters')).toBeOnTheScreen();
    expect(api.find('POST', '/auth/change-password')).toHaveLength(0);
  });

  it('a wrong current password is shown on that field and keeps the session', async () => {
    signInAs('EMPLOYEE');
    fakeServer('EMPLOYEE');
    mockApi({
      'GET /profile': () => makeUser('EMPLOYEE'),
      'POST /auth/change-password': () => apiError(422, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect'),
    });
    await renderScreen(<ProfileScreen />);
    await fireEvent.changeText(screen.getByTestId('pw-current'), 'wrong-password-1');
    await fireEvent.changeText(screen.getByTestId('pw-new'), 'new-password-456');
    await fireEvent.changeText(screen.getByTestId('pw-confirm'), 'new-password-456');
    await fireEvent.press(screen.getByTestId('pw-submit'));
    await waitFor(() => expect(screen.getAllByText('Current password is incorrect').length).toBeGreaterThan(0));
    expect(useAuth.getState().status).toBe('signedIn');
  });

  it('success signs out (all sessions are revoked server-side)', async () => {
    signInAs('ADMIN_OWNER');
    const api = mockApi({ 'GET /profile': () => makeUser('ADMIN_OWNER'), 'POST /auth/change-password': () => ({ message: 'ok' }) });
    await renderScreen(<ProfileScreen back />);
    await fireEvent.changeText(screen.getByTestId('pw-current'), 'old-password-123');
    await fireEvent.changeText(screen.getByTestId('pw-new'), 'new-password-456');
    await fireEvent.changeText(screen.getByTestId('pw-confirm'), 'new-password-456');
    await fireEvent.press(screen.getByTestId('pw-submit'));
    await waitFor(() => expect(useAuth.getState().status).toBe('signedOut'));
    expect(api.find('POST', '/auth/change-password')[0]!.body).toEqual({ currentPassword: 'old-password-123', newPassword: 'new-password-456' });
  });

  it('Google-only accounts get an emailed set-password link instead of a broken form', async () => {
    signInAs('CUSTOMER', { hasPassword: false, hasGoogleLink: true });
    const api = mockApi({ 'GET /profile': () => makeUser('CUSTOMER', { hasPassword: false, hasGoogleLink: true }), 'POST /auth/forgot-password': () => ({ message: 'ok' }) });
    await renderScreen(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Email me a link to create a password')).toBeOnTheScreen());
    expect(screen.queryByTestId('pw-current')).toBeNull();
    await fireEvent.press(screen.getByText('Email me a link to create a password'));
    await waitFor(() => expect(api.find('POST', '/auth/forgot-password')).toHaveLength(1));
  });
});
