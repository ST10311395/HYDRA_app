import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import ScanScreen from '../app/employee/(tabs)/scan';
import EmployeeJob from '../app/employee/job/[id]';
import { captureArrivalLocation, parseHydraQr } from '../features/checkin';
import { ShiftCard } from '../features/ShiftCard';
import { JOB_ID, apiError, makeJob, mockApi, renderScreen, signInAs } from '../test-utils';

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    // The fake camera exposes its barcode callback so tests can "scan" a code.
    CameraView: (props: { onBarcodeScanned: (r: { data: string }) => void }) => React.createElement(View, { testID: 'camera', onBarcodeScanned: props.onBarcodeScanned }),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

const QR = `HYDRA1:${JOB_ID}:AbCdEfGhIjKlMnOpQrStUvWx`;
const setParams = (p: Record<string, string>) => (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams(p);
const scan = async (data: string) => {
  await act(async () => {
    screen.getByTestId('camera').props.onBarcodeScanned({ data });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  signInAs('EMPLOYEE');
});

describe('QR parsing and GPS capture', () => {
  it('accepts only well-formed HYDRA job QR payloads', () => {
    expect(parseHydraQr(QR)).toEqual({ jobId: JOB_ID, payload: QR });
    expect(parseHydraQr(`  ${QR}  `)?.jobId).toBe(JOB_ID);
    expect(parseHydraQr('https://evil.example/phish')).toBeNull();
    expect(parseHydraQr(`HYDRA1:${JOB_ID}:short`)).toBeNull();
    expect(parseHydraQr(`HYDRA1:not-a-uuid:AbCdEfGhIjKlMnOpQrStUvWx`)).toBeNull();
  });

  it('asks for foreground location only at check-in and returns a fix', async () => {
    await expect(captureArrivalLocation()).resolves.toEqual({ ok: true, latitude: -26.1076, longitude: 28.0567, accuracy: 8 });
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('reports a denied permission without reading location', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    await expect(captureArrivalLocation()).resolves.toMatchObject({ ok: false, reason: 'denied' });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('falls back to a recent last-known position when a fresh fix fails', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('no fix'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValueOnce({ coords: { latitude: -26.2, longitude: 28.1, accuracy: 40 } });
    await expect(captureArrivalLocation()).resolves.toEqual({ ok: true, latitude: -26.2, longitude: 28.1, accuracy: 40 });
  });
});

describe('QR arrival check-in flow', () => {
  it('scans, captures GPS and confirms arrival through the API', async () => {
    const job = makeJob({ status: 'IN_PROGRESS' });
    const m = mockApi({ 'POST /jobs/:id/checkin': () => ({ job, shiftStarted: true, distanceMetres: 12 }) });
    await renderScreen(<ScanScreen />);
    await scan(QR);
    expect(await screen.findByText('Arrival confirmed')).toBeOnTheScreen();
    expect(screen.getByText('Your shift was started automatically.')).toBeOnTheScreen();
    const call = m.find('POST', `/jobs/${JOB_ID}/checkin`)[0]!;
    expect(call.body).toEqual({ qrToken: QR, location: { latitude: -26.1076, longitude: 28.0567, accuracy: 8 } });
  });

  it('rejects a foreign QR code without calling the API', async () => {
    const m = mockApi({});
    await renderScreen(<ScanScreen />);
    await scan('WIFI:S:guest;P:secret;;');
    expect(await screen.findByText('This is not a PSG Electrical job QR code.')).toBeOnTheScreen();
    expect(m.calls.filter((c) => c.path.includes('/checkin'))).toHaveLength(0);
  });

  it('shows the server reason (e.g. not assigned / expired) and allows a retry', async () => {
    mockApi({ 'POST /jobs/:id/checkin': () => apiError(403, 'NOT_ASSIGNED', 'You are not assigned to this job.') });
    await renderScreen(<ScanScreen />);
    await scan(QR);
    expect(await screen.findByText('You are not assigned to this job.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Scan again' }));
    expect(screen.getByTestId('camera')).toBeOnTheScreen();
  });

  it('does not check in when location permission is refused', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    const m = mockApi({});
    await renderScreen(<ScanScreen />);
    await scan(QR);
    expect(await screen.findByText(/Location permission is required/)).toBeOnTheScreen();
    expect(m.calls.filter((c) => c.path.includes('/checkin'))).toHaveLength(0);
  });
});

describe('shift and job workflow', () => {
  it('clocks in directly and clocks out only after confirmation', async () => {
    const m = mockApi({
      'POST /timesheets/clock-in': () => ({ id: 't1', clockIn: '2026-09-29T06:00:00Z', totalHours: null }),
      'POST /timesheets/clock-out': () => ({ id: 't1', clockIn: '2026-09-29T06:00:00Z', totalHours: 8 }),
    });
    const { rerender } = await renderScreen(<ShiftCard openShift={null} todayHours={0} />);
    await fireEvent.press(screen.getByTestId('clock-button'));
    await waitFor(() => expect(m.find('POST', '/timesheets/clock-in')).toHaveLength(1));

    const open = { id: 't1', employeeId: 'emp-1', employeeName: 'Sipho', jobId: null, jobReference: null, workDate: '2026-09-29', clockIn: new Date().toISOString(), clockOut: null, totalHours: null, status: 'OPEN' as const, notes: null, payrollId: null };
    await rerender(<ShiftCard openShift={open} todayHours={0} />);
    await fireEvent.press(screen.getByTestId('clock-button'));
    expect(screen.getByText('Clock out?')).toBeOnTheScreen();
    expect(m.find('POST', '/timesheets/clock-out')).toHaveLength(0);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Clock out' }).at(-1)!);
    await waitFor(() => expect(m.find('POST', '/timesheets/clock-out')).toHaveLength(1));
  });

  it('only offers actions the server allows, and completes work after confirmation', async () => {
    setParams({ id: JOB_ID });
    const job = makeJob({ status: 'IN_PROGRESS', electrician: { id: 'emp-1', name: 'Sipho Test', phone: null }, allowedActions: ['LOG_MATERIALS', 'COMPLETE_WORK', 'ADD_PHOTOS'] });
    const m = mockApi({
      'GET /jobs/:id': () => job,
      'POST /jobs/:id/complete': () => ({ ...job, status: 'INSPECTION_PENDING', allowedActions: ['SUBMIT_INSPECTION', 'LOG_MATERIALS'] }),
    });
    await renderScreen(<EmployeeJob />);
    expect(await screen.findByRole('button', { name: 'Mark work complete' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Scan customer QR' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Work summary for the customer (optional)'), 'Replaced DB board and tested all circuits.');
    await fireEvent.press(screen.getByRole('button', { name: 'Mark work complete' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Complete work' }));
    await waitFor(() => expect(m.find('POST', `/jobs/${JOB_ID}/complete`)).toHaveLength(1));
    expect(m.find('POST', `/jobs/${JOB_ID}/complete`)[0]?.body).toEqual({ summary: 'Replaced DB board and tested all circuits.' });
    expect(await screen.findByRole('button', { name: 'Start inspection report' })).toBeOnTheScreen();
  });
});
