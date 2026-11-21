import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInr } from '../lib/utils';
import type { SaleInvoiceData } from '../lib/invoicePdf';
export default function GenericInvoice({ sale, close }: { sale: SaleInvoiceData; close: () => void }) {
  const lines = sale.lines || [];
  const download = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(sale.shop_name || 'Business invoice', 14, 18);
    doc.setFontSize(10); doc.text(`${sale.invoice_no} | ${sale.status} | ${String(sale.sold_at).slice(0, 10)}`, 14, 27);
    doc.text(`Customer: ${sale.customer_name || 'Walk-in'} ${sale.customer_phone || ''}`, 14, 34);
    autoTable(doc, { startY: 42, head: [['Item / SKU', 'Qty', 'Unit price INR', 'Discount INR', 'Tax INR', 'Total INR']], body: lines.map((line) => [`${line.name} (${line.sku})`, line.quantity || 1, Number(line.unit_price_inr || 0).toFixed(2), Number(line.discount_inr || 0).toFixed(2), Number(line.tax_inr || 0).toFixed(2), Number(line.line_total_inr).toFixed(2)]), margin: { bottom: 28 }, didDrawPage: () => { doc.setFontSize(10); doc.text(`Invoice total: INR ${Number(sale.total_inr).toFixed(2)}`, 14, 282); } });
    doc.save(`${sale.invoice_no}.pdf`);
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"><section role="dialog" aria-label="Invoice details" aria-modal="true" className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{sale.shop_name || 'Business invoice'}</h2><p className="text-sm text-slate-500">{sale.invoice_no} · {sale.status}</p></div><div className="flex gap-2"><button className="btn ghost" onClick={download}>Download invoice PDF</button><button className="btn ghost" onClick={close}>Close invoice</button></div></div>
    <div className="mb-6 grid gap-3 text-sm sm:grid-cols-2"><p>Customer: <strong>{sale.customer_name || 'Walk-in'}</strong><br />{sale.customer_phone}<br />{sale.customer_email}</p><p>Date: {String(sale.sold_at).slice(0, 10)}<br />{[sale.customer_address_line1, sale.customer_city, sale.customer_state, sale.customer_postal_code].filter(Boolean).join(', ')}</p></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500">{['Item', 'Quantity', 'Unit price', 'Discount', 'Tax', 'Line total'].map((heading) => <th key={heading} className="p-2">{heading}</th>)}</tr></thead><tbody>{lines.map((line) => <tr key={line.id} className="border-b"><td className="p-2">{line.name}<span className="block text-xs text-slate-500">{line.sku}</span></td><td className="p-2">{line.quantity}</td><td className="p-2">{formatInr(line.unit_price_inr)}</td><td className="p-2">{formatInr(line.discount_inr)}</td><td className="p-2">{formatInr(line.tax_inr)} ({line.tax_rate_pct}%)</td><td className="p-2">{formatInr(line.line_total_inr)}</td></tr>)}</tbody></table></div>
    <div className="ml-auto mt-5 max-w-xs space-y-2 text-sm"><p>Subtotal: {formatInr(sale.subtotal_inr)}</p><p>Discount: {formatInr(sale.discount_inr)}</p><p>Tax: {formatInr(sale.tax_inr)}</p><p className="text-lg font-bold">Total: {formatInr(sale.total_inr)}</p>{sale.payments?.map((payment) => <p key={payment.id}>{payment.method}: {formatInr(payment.amount_inr)} {payment.reference}</p>)}</div>
  </section></div>;
}
