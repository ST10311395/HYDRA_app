/**
 * Employee QR scanner states (physical-phone review §15): every camera/permission/platform state
 * renders an explicit screen — never a blank one — and no state fakes a successful scan.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import ScanScreen from '../app/employee/(tabs)/scan';
import { cameraSupport, describeCheckinError } from '../features/checkin';
import { apiError, mockApi, renderScreen, signInAs } from '../test-utils';

type Perm = { granted: boolean; canAskAgain: boolean; status: 'granted' | 'denied' | 'undetermined' } | null;
const cam = { perm: null as Perm, request: jest.fn(async () => ({ granted: true })), mountError: null as string | null };

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props: { onBarcodeScanned: (r: { data: string }) => void; onMountError?: (e: { message: string }) => void }) => {
      const { onMountError } = props;
      React.useEffect(() => {
        const m = jest.requireMock('expo-camera') as { __cam: typeof cam };
        if (m.__cam.mountError) onMountError?.({ message: m.__cam.mountError });
      }, [onMountError]);
      return React.createElement(View, { testID: 'camera', onBarcodeScanned: props.onBarcodeScanned });
    },
    useCameraPermissions: () => {
      const m = jest.requireMock('expo-camera') as { __cam: typeof cam };
      return [m.__cam.perm, m.__cam.request];
    },
    __cam: undefined as unknown,
  };
});
(jest.requireMock('expo-camera') as { __cam: typeof cam }).__cam = cam;

const JOB_ID = '6f0e3c1e-1111-4111-8111-111111111111';
const QR = `HYDRA1:${JOB_ID}:AbCdEfGhIjKlMnOpQrStUvWx`;
const scan = async (data: string) => {
  await act(async () => {
    screen.getByTestId('camera').props.onBarcodeScanned({ data });
  });
};

beforeEach(() => {
  signInAs('EMPLOYEE');
  cam.perm = { granted: true, canAskAgain: true, status: 'granted' };
  cam.mountError = null;
  cam.request.mockClear();
  mockApi({ 'GET /public-content': () => ({ company: { hotline: '011 000 0000', emergencyLine: '011 000 0001' } }) });
});

describe('camera permission states', () => {
  it('while permission is being read: an explicit loading card, not a blank screen', async () => {
    cam.perm = null;
    await renderScreen(<ScanScreen />);
    expect(screen.getByTestId('scan-permission-loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('camera')).toBeNull();
  });

  it('not yet requested: explains why and asks', async () => {
    cam.perm = { granted: false, canAskAgain: true, status: 'undetermined' };
    await renderScreen(<ScanScreen />);
    expect(screen.getByText('Camera access needed')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(cam.request).toHaveBeenCalledTimes(1);
  });

  it('denied once: can ask again', async () => {
    cam.perm = { granted: false, canAskAgain: true, status: 'denied' };
    await renderScreen(<ScanScreen />);
    expect(screen.getByText('Camera access was declined')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeOnTheScreen();
  });

  it('permanently denied: opens system settings (and survives settings being unavailable)', async () => {
    cam.perm = { granted: false, canAskAgain: false, status: 'denied' };
    const spy = jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(new Error('unsupported'));
    await renderScreen(<ScanScreen />);
    expect(screen.getByText('Camera access is turned off')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('camera fails to start: explicit unavailable state with retry and office fallback', async () => {
    cam.mountError = 'Camera is in use by another app';
    await renderScreen(<ScanScreen />);
    expect(await screen.findByTestId('scan-camera-error')).toBeOnTheScreen();
    expect(screen.getByText('Camera is in use by another app')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Call the office for manual confirmation' })).toBeOnTheScreen();
  });
});

describe('browser support detection', () => {
  it('native is always supported; web needs a secure context with getUserMedia', () => {
    expect(cameraSupport({ os: 'android' })).toBe('ok');
    expect(cameraSupport({ os: 'web', isSecureContext: false, hasGetUserMedia: false })).toBe('insecure');
    expect(cameraSupport({ os: 'web', isSecureContext: true, hasGetUserMedia: false })).toBe('unsupported');
    expect(cameraSupport({ os: 'web', isSecureContext: true, hasGetUserMedia: true })).toBe('ok');
  });
});

describe('scan outcomes (server decides; nothing is faked)', () => {
  it.each([
    ['QR_EXPIRED', 'QR code expired'],
    ['QR_INVALID', 'QR code not recognised'],
    ['NOT_FOUND', 'Not your assigned job'],
    ['ALREADY_CHECKED_IN', 'Already checked in'],
  ])('%s → "%s"', async (code, title) => {
    mockApi({ 'POST /jobs/:id/checkin': () => apiError(code === 'NOT_FOUND' ? 404 : 422, code, 'Server said no') });
    await renderScreen(<ScanScreen />);
    await scan(QR);
    expect(await screen.findByText(title)).toBeOnTheScreen();
    expect(screen.queryByText('Arrival confirmed')).toBeNull();
  });

  it('network failure says nothing was recorded', async () => {
    mockApi({});
    (global.fetch as jest.Mock).mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });
    await renderScreen(<ScanScreen />);
    await scan(QR);
    expect(await screen.findByText('No connection')).toBeOnTheScreen();
    expect(screen.getByText(/Nothing was recorded/)).toBeOnTheScreen();
    expect(screen.queryByText('Arrival confirmed')).toBeNull();
  });

  it('error descriptions cover every server code', () => {
    for (const c of ['QR_INVALID', 'QR_EXPIRED', 'QR_JOB_MISMATCH', 'NOT_FOUND', 'ALREADY_CHECKED_IN', 'QR_ALREADY_USED', 'NETWORK', undefined]) {
      expect(describeCheckinError(c, 'm').title.length).toBeGreaterThan(0);
    }
    expect(describeCheckinError('QR_ALREADY_USED', 'm').final).toBe(true);
  });
});
