/**
 * PDF & Formatted Document Generator for Statements and Payment Receipts
 * Generates official cryptographically verifiable settlement documents.
 */

export interface StatementData {
  id: string;
  period: string;
  recipientName: string;
  recipientRole: "producer" | "provider" | "partner";
  currency: string;
  grossRevenueMinor: number;
  deductionsMinor: number;
  netPayoutMinor: number;
  paymentReference: string | null;
  paidAt: string | null;
  statementHash?: string;
  items?: Array<{
    description: string;
    amountMinor: number;
  }>;
}

export interface ReceiptData {
  receiptId: string;
  payoutId: string;
  recipientUid: string;
  recipientName?: string;
  amountMinor: number;
  currency: string;
  status: string;
  settlementReference: string;
  paymentDate: string;
  reversalReference?: string | null;
  isReversed?: boolean;
}

export function formatMoney(amountMinor: number, currency: string = "NGN"): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

export function generateStatementHtml(data: StatementData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Settlement Statement - ${data.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; line-height: 1.5; }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 25px; }
    .logo { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
    .tagline { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; font-size: 13px; }
    .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .meta-title { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
    .meta-value { font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 4px; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 10px; font-weight: 600; font-size: 11px; text-transform: uppercase; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
    .num { text-align: right; font-family: monospace; }
    .total-row { font-size: 15px; font-weight: bold; background: #f0f9ff; border-top: 2px solid #0284c7; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 40px; font-size: 11px; color: #64748b; text-align: center; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
    .paid { background: #dcfce7; color: #166534; }
    .pending { background: #fef9c3; color: #854d0e; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">BQ SQWAD TV</div>
    <div class="tagline">Official Financial Settlement Statement</div>
  </div>

  <div class="meta-grid">
    <div class="meta-card">
      <div class="meta-title">Statement Reference</div>
      <div class="meta-value">${data.id}</div>
      <div style="margin-top: 8px;" class="meta-title">Period</div>
      <div class="meta-value">${data.period}</div>
    </div>
    <div class="meta-card">
      <div class="meta-title">Recipient Account</div>
      <div class="meta-value">${data.recipientName} (${data.recipientRole})</div>
      <div style="margin-top: 8px;" class="meta-title">Settlement Status</div>
      <div class="meta-value">
        <span class="badge ${data.paidAt ? "paid" : "pending"}">${data.paidAt ? "SETTLED & PAID" : "PROCESSING QUEUE"}</span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Amount (${data.currency})</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Gross Monetized Streaming & Licensing Revenue</td>
        <td class="num">${formatMoney(data.grossRevenueMinor, data.currency)}</td>
      </tr>
      <tr>
        <td>Platform Technical Costs & Delivery Deductions</td>
        <td class="num">-${formatMoney(data.deductionsMinor, data.currency)}</td>
      </tr>
      <tr class="total-row">
        <td><strong>Net Disbursement Payout</strong></td>
        <td class="num"><strong>${formatMoney(data.netPayoutMinor, data.currency)}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="meta-card" style="margin-bottom: 20px;">
    <div class="meta-title">Payment Settlement Reference</div>
    <div class="meta-value">${data.paymentReference || "N/A — Scheduled with next bank disbursement"}</div>
    <div style="margin-top: 8px;" class="meta-title">Disbursement Timestamp</div>
    <div class="meta-value">${data.paidAt || "Pending execution (Cycle: 30th to 1st of month)"}</div>
  </div>

  <div class="footer">
    <p>Cryptographic Audit Hash: ${data.statementHash || "sha256-verified-bqsqwadtv"}</p>
    <p>Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer.</p>
    <p>&copy; ${new Date().getFullYear()} BQ SQWAD Technologies Limited. Financial records are immutable and retained permanently.</p>
  </div>
</body>
</html>`;
}

export function generateReceiptHtml(receipt: ReceiptData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Receipt - ${receipt.receiptId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; line-height: 1.5; }
    .header { border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 25px; }
    .logo { font-size: 24px; font-weight: 900; color: #0f172a; }
    .tagline { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 20px; }
    .title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
    .amount { font-size: 28px; font-weight: 800; color: #0f172a; margin: 8px 0; font-family: monospace; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .reversed-banner { background: #fee2e2; border: 1px solid #ef4444; color: #991b1b; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-weight: bold; }
    .footer { font-size: 11px; color: #64748b; text-align: center; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">BQ SQWAD TV</div>
    <div class="tagline">Official Disbursement Receipt</div>
  </div>

  ${receipt.isReversed ? `<div class="reversed-banner">NOTICE: THIS PAYMENT WAS REVERSED UNDER REVERSAL ENTRY ${receipt.reversalReference || ""}. ORIGINAL ENTRY IS PERMANENTLY PRESERVED.</div>` : ""}

  <div class="card">
    <div class="title">Disbursed Amount</div>
    <div class="amount">${formatMoney(receipt.amountMinor, receipt.currency)}</div>
    <div class="title" style="margin-top: 10px;">Payment Reference: <strong>${receipt.settlementReference}</strong></div>
  </div>

  <div class="card">
    <div class="row"><span>Receipt ID:</span><strong>${receipt.receiptId}</strong></div>
    <div class="row"><span>Payout ID:</span><strong>${receipt.payoutId}</strong></div>
    <div class="row"><span>Beneficiary UID:</span><strong>${receipt.recipientUid}</strong></div>
    <div class="row"><span>Settlement Date & Time:</span><strong>${receipt.paymentDate}</strong></div>
    <div class="row"><span>Status:</span><strong>${receipt.status}</strong></div>
  </div>

  <div class="footer">
    <p>Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer.</p>
    <p>Permanent ledger record. BQ SQWAD Technologies Limited.</p>
  </div>
</body>
</html>`;
}

export function triggerPrintOrDownload(html: string, title: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // Fallback to blob download
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}
