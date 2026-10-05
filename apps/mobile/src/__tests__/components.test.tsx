/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { QuoteDto } from '@hydra/shared';
import { JobCard, QuoteBreakdown, Timeline } from '../components/jobs';
import { Badge, Button, Checkbox, ConfirmHost, EmptyState, ErrorState, Segmented, TextField, confirm } from '../design-system';
import { makeJob } from '../test-utils';

describe('design system', () => {
  it('Button fires onPress and exposes an accessible label', async () => {
    const onPress = jest.fn();
    await render(<Button label="Submit request" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Button does not fire while disabled or loading (duplicate-submit prevention)', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="Disabled" disabled onPress={onPress} />
        <Button label="Loading" loading onPress={onPress} testID="loading-btn" />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Disabled' }));
    await fireEvent.press(screen.getByTestId('loading-btn'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  });

  it('TextField shows field-level error text', async () => {
    await render(<TextField label="Site address" value="" onChangeText={() => undefined} error="Must be at least 5 characters" />);
    expect(screen.getByText('Must be at least 5 characters')).toBeOnTheScreen();
    expect(screen.getByLabelText('Site address')).toBeOnTheScreen();
  });

  it('Checkbox toggles and reports its checked state', async () => {
    const onChange = jest.fn();
    await render(<Checkbox checked={false} onChange={onChange} label="I agree" />);
    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Segmented exposes radio semantics', async () => {
    const onChange = jest.fn();
    await render(<Segmented value="A" onChange={onChange} options={[{ value: 'A', label: 'Alpha' }, { value: 'B', label: 'Beta' }]} />);
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('B');
  });

  it('EmptyState and ErrorState render messages and retry', async () => {
    const retry = jest.fn();
    await render(
      <>
        <EmptyState title="No jobs yet" message="Request a service to get started." />
        <ErrorState message="Server unavailable" onRetry={retry} />
      </>,
    );
    expect(screen.getByText('No jobs yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('Badge renders its label', async () => {
    await render(<Badge label="COMPLETED" tone="success" />);
    expect(screen.getByLabelText('COMPLETED')).toBeOnTheScreen();
  });

  it('confirm() resolves true only when the user confirms (destructive actions)', async () => {
    await render(<ConfirmHost />);
    let result: Promise<boolean> | undefined;
    await act(async () => {
      result = confirm({ title: 'Cancel job?', message: 'This cannot be undone.', confirmLabel: 'Cancel job', destructive: true });
    });
    expect(screen.getByText('Cancel job?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel job' }));
    await expect(result).resolves.toBe(true);

    await act(async () => {
      result = confirm({ title: 'Sign out?', message: 'Sure?' });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await expect(result).resolves.toBe(false);
  });
});

describe('job components', () => {
  it('JobCard shows reference, status and customer, and is pressable', async () => {
    const onPress = jest.fn();
    await render(<JobCard job={makeJob({ status: 'SCHEDULED', urgency: 'EMERGENCY' })} onPress={onPress} showCustomer />);
    expect(screen.getByText('JOB-2026-0042')).toBeOnTheScreen();
    expect(screen.getByLabelText('SCHEDULED')).toBeOnTheScreen();
    expect(screen.getByText('Thandi Test')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('job-JOB-2026-0042'));
    expect(onPress).toHaveBeenCalled();
  });

  it('Timeline marks completed milestones and the next one', async () => {
    await render(
      <Timeline
        milestones={[
          { id: 'm1', code: 'REQUESTED', name: 'Requested', description: null, status: 'COMPLETED', sequenceOrder: 1, plannedDate: null, completedAt: '2026-09-20T08:00:00Z' },
          { id: 'm2', code: 'QUOTED', name: 'Quote Prepared', description: null, status: 'PENDING', sequenceOrder: 2, plannedDate: null, completedAt: null },
          { id: 'm3', code: 'ACCEPTED', name: 'Quote Accepted', description: null, status: 'PENDING', sequenceOrder: 3, plannedDate: null, completedAt: null },
        ]}
      />,
    );
    expect(screen.getByLabelText('Requested: completed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quote Prepared: next')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quote Accepted: pending')).toBeOnTheScreen();
  });

  it('QuoteBreakdown shows labour, materials, VAT and total separately', async () => {
    const quote: QuoteDto = {
      id: 'q1', jobId: 'j1', jobReference: 'JOB-1', version: 1, status: 'SENT', labourCost: 1000, materialsCost: 500, fees: 0, discountAmount: 0,
      subtotal: 1500, vatRate: 0.15, vatAmount: 225, total: 1725, validUntil: '2026-10-15', terms: null, notes: null, sentAt: null, respondedAt: null, declineReason: null,
      items: [{ id: 'i1', kind: 'LABOUR', description: 'Installation labour', quantity: 1, unitPrice: 1000, lineTotal: 1000 }], createdAt: '2026-09-20T08:00:00Z',
    };
    await render(<QuoteBreakdown quote={quote} />);
    expect(screen.getByText('Labour')).toBeOnTheScreen();
    expect(screen.getByText('Estimated materials')).toBeOnTheScreen();
    expect(screen.getByText('VAT (15%)')).toBeOnTheScreen();
    expect(screen.getByText('Total')).toBeOnTheScreen();
  });
});
