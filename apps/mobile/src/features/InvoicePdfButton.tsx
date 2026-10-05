/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { Button, toast } from '../design-system';
import { saveAndShare } from './exportFile';

/** Downloads the server-rendered tax invoice PDF and opens the share sheet (save to Files, email, print). */
export function InvoicePdfButton({ invoiceId }: { invoiceId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label="Download invoice (PDF)"
      icon="download"
      variant="outline"
      loading={busy}
      testID="invoice-pdf"
      onPress={() => void (async () => {
        setBusy(true);
        try {
          const file = await api.download(`/invoices/${invoiceId}/pdf`);
          await saveAndShare(file.bytes, file.fileName, 'application/pdf');
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      })()}
    />
  );
}
