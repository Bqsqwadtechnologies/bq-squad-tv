import { Firestore, ApiError } from "./firebase-admin";

export interface ReceiptItem {
  description: string;
  quantity: number;
  unitAmountMinor: number;
  totalAmountMinor: number;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  uid: string;
  customerEmail: string;
  customerName: string;
  type: "topup" | "charge" | "refund" | "payout";
  amountMinor: number;
  currency: string;
  paymentReference: string;
  paymentProvider: string;
  status: "ISSUED" | "REFUNDED" | "VOIDED";
  items: ReceiptItem[];
  createdAt: string;
  sentCount: number;
  lastSentAt?: string;
}

export async function generateSequentialReceiptNumber(
  fs: Firestore,
  prefix: "REC" | "PAY" | "REF" = "REC",
): Promise<string> {
  const counterDoc = (await fs.get("counters/receipts")) || {};
  const currentVal = Number(counterDoc["seq"] || 0);
  const nextVal = currentVal + 1;
  await fs.set("counters/receipts", {
    seq: nextVal,
    updatedAt: new Date().toISOString(),
  });
  return `BQ-${prefix}-${String(nextVal).padStart(6, "0")}`;
}

export function renderReceiptHtml(receipt: ReceiptRecord): string {
  const symbol = receipt.currency === "NGN" ? "₦" : "$";
  const formattedTotal = `${symbol}${(receipt.amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const rows = receipt.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 8px; border-bottom: 1px solid #1e293b; color: #f8fafc;">${item.description}</td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #1e293b; text-align: center; color: #94a3b8;">${item.quantity}</td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #1e293b; text-align: right; color: #f8fafc;">${symbol}${(item.unitAmountMinor / 100).toFixed(2)}</td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #1e293b; text-align: right; font-weight: bold; color: #38bdf8;">${symbol}${(item.totalAmountMinor / 100).toFixed(2)}</td>
    </tr>
  `,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt ${receipt.receiptNumber} | BQ SQWAD TV</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 40px; }
    .receipt-container { max-width: 700px; margin: 0 auto; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 24px; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #38bdf8; }
    .logo span { color: #f8fafc; }
    .meta { text-align: right; font-size: 13px; color: #94a3b8; }
    .receipt-no { font-family: monospace; font-size: 16px; font-weight: bold; color: #38bdf8; }
    .customer-box { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 13px; }
    .customer-label { color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #334155; color: #94a3b8; font-size: 12px; text-transform: uppercase; }
    .total-box { display: flex; justify-content: flex-end; padding-top: 16px; border-top: 2px solid #334155; font-size: 18px; font-weight: bold; }
    .footer { margin-top: 32px; font-size: 11px; text-align: center; color: #64748b; line-height: 1.5; }
    @media print {
      body { background: white; color: black; padding: 0; }
      .receipt-container { border: none; box-shadow: none; background: white; color: black; }
      .header, table, th, td, .total-box { border-color: #ccc !important; color: black !important; }
      .customer-box { background: #eee !important; color: black !important; }
      .receipt-no, .logo { color: black !important; }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <div>
        <div class="logo">BQ SQWAD <span>TV</span></div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Official Financial Document</div>
      </div>
      <div class="meta">
        <div class="receipt-no">${receipt.receiptNumber}</div>
        <div>Date: ${new Date(receipt.createdAt).toLocaleDateString()}</div>
        <div>Reference: <span style="font-family: monospace;">${receipt.paymentReference}</span></div>
      </div>
    </div>

    <div class="customer-box">
      <div class="customer-label">Billed To</div>
      <div style="font-weight: bold; font-size: 15px; color: #f8fafc;">${receipt.customerName || "Viewer"}</div>
      <div style="color: #cbd5e1;">${receipt.customerEmail}</div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Account ID: ${receipt.uid}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="total-box">
      <span style="color: #94a3b8; margin-right: 16px; font-weight: normal;">Total Paid:</span>
      <span>${formattedTotal}</span>
    </div>

    <div class="footer">
      BQ SQWAD TV • Powered by Bqsqwad Technologies Ltd.<br/>
      Support: tv@bqsqwad.com • All electronic receipts are tamper-evident and permanently recorded.
    </div>
  </div>
</body>
</html>`;
}
