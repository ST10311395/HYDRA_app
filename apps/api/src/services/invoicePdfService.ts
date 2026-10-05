/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import PDFDocument from 'pdfkit';
import { formatZar, type InvoiceDto, type PublicContentDto } from '@hydra/shared';
import { db } from '../db/pool';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import type { AuthContext } from '../types/express';
import { getInvoice } from './billingService';

const date = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/**
 * Tax invoice PDF for a customer or admin (spec §8.6 “download/view invoice”). Access is checked by
 * `getInvoice` (customers only ever receive their own invoices).
 */
export async function invoicePdf(auth: AuthContext, invoiceId: string): Promise<{ fileName: string; body: Buffer }> {
  const inv = await getInvoice(auth, invoiceId);
  const company = (await new PostgresSettingsRepository(db()).getJson<PublicContentDto>('publicContent'))?.company;
  return { fileName: `${inv.number}.pdf`, body: await render(inv, company) };
}

function render(inv: InvoiceDto, company: PublicContentDto['company'] | undefined): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${inv.number}`, Author: company?.name ?? 'PSG Electrical & Cables' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const right = doc.page.width - 48;
    const col = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111111').text(label, 300, y, { width: 150 });
      doc.text(value, 450, y, { width: right - 450, align: 'right' });
      doc.moveDown(0.3);
    };

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#2F6BFF').text(company?.name ?? 'PSG Electrical & Cables');
    doc.font('Helvetica').fontSize(9).fillColor('#555555').text([company?.email, company?.hotline].filter(Boolean).join(' · '));
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(inv.status === 'DRAFT' ? 'DRAFT INVOICE' : 'TAX INVOICE');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Invoice no.: ${inv.number}`);
    doc.text(`Job: ${inv.jobReference}`);
    doc.text(`Invoice date: ${date(inv.invoiceDate)}    Due: ${date(inv.dueDate)}`);
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Bill to');
    doc.font('Helvetica').text(inv.customer.name).text(inv.customer.email);
    if (inv.customer.phone) doc.text(inv.customer.phone);
    doc.moveDown();

    const top = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).text('Description', 48, top, { width: 280 }).text('Qty', 330, top, { width: 40, align: 'right' })
      .text('Unit', 375, top, { width: 80, align: 'right' }).text('Amount', 460, top, { width: right - 460, align: 'right' });
    doc.moveTo(48, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5).font('Helvetica');
    for (const i of inv.items) {
      const y = doc.y;
      doc.text(i.description, 48, y, { width: 280 });
      const h = doc.y - y;
      doc.text(String(i.quantity), 330, y, { width: 40, align: 'right' }).text(formatZar(i.unitPrice), 375, y, { width: 80, align: 'right' })
        .text(formatZar(i.lineTotal), 460, y, { width: right - 460, align: 'right' });
      doc.y = y + Math.max(h, 12) + 4;
      if (doc.y > doc.page.height - 160) doc.addPage();
    }
    doc.moveDown();
    col('Subtotal', formatZar(inv.subtotal + inv.materialsAdjustment));
    col('VAT', formatZar(inv.vatAmount));
    col('Invoice total', formatZar(inv.total), true);
    for (const d of inv.discounts) col(`Reward ${d.code}`, `− ${formatZar(d.amountApplied)}`);
    if (inv.amountPaid) col('Paid', `− ${formatZar(inv.amountPaid)}`);
    col('Amount due', formatZar(inv.amountDue), true);

    if (inv.payments.some((p) => p.status === 'SUCCEEDED')) {
      doc.moveDown().font('Helvetica-Bold').fontSize(10).text('Payments received', 48);
      doc.font('Helvetica').fontSize(9);
      for (const p of inv.payments.filter((x) => x.status === 'SUCCEEDED')) {
        doc.text(`${date(p.paidAt ?? p.createdAt)} · ${p.method} · ${formatZar(p.amount)}${p.providerReference ? ` · ref ${p.providerReference}` : ''}`);
      }
    }
    if (inv.notes) doc.moveDown().fontSize(9).fillColor('#333333').text(inv.notes, 48);
    doc.moveDown(2).fontSize(8).fillColor('#777777')
      .text('Pay securely in the PSG Electrical app. Card payments are processed by our PCI-DSS compliant payment provider; we never store card details.', 48);
    doc.end();
  });
}
