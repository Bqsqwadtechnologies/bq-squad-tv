import { describe, expect, it } from "vitest";
import { getNextPayoutWindow, PAYOUT_WINDOW_DISCLOSURE } from "../lib/payout-calendar";
import {
  generateReceiptHtml,
  generateStatementHtml,
  formatMoney,
} from "../lib/pdf-statement";

describe("Batch 8 — Payout Calendar, Policy & Settle Workflow", () => {
  it("calculates next payout window and enforces required disclosure wording", () => {
    const windowInfo = getNextPayoutWindow(new Date("2026-06-15T12:00:00Z"));

    expect(windowInfo.disclosure).toBe(
      "Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer.",
    );
    expect(PAYOUT_WINDOW_DISCLOSURE).toBe(
      "Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer.",
    );
    expect(windowInfo.nextPayoutDateFormatted).toContain("2026");
    expect(windowInfo.nextPayoutDateFormatted).toContain("Jun 30, 2026 – Jul 1, 2026");
    expect(windowInfo.isWindowActive).toBe(false);

    // Active window test on 30th of month
    const activeWindowInfo = getNextPayoutWindow(new Date("2026-06-30T10:00:00Z"));
    expect(activeWindowInfo.isWindowActive).toBe(true);

    // Active window test on 1st of month
    const activeWindowInfoDay1 = getNextPayoutWindow(new Date("2026-07-01T08:00:00Z"));
    expect(activeWindowInfoDay1.isWindowActive).toBe(true);
  });

  it("generates cryptographic PDF statement HTML with required metadata and disclosure", () => {
    const html = generateStatementHtml({
      id: "stmt_test_9981",
      period: "May 2026",
      recipientName: "Apex Studios",
      recipientRole: "producer",
      currency: "NGN",
      grossRevenueMinor: 5000000,
      deductionsMinor: 1500000,
      netPayoutMinor: 3500000,
      paymentReference: "NIP-20260531-8891",
      paidAt: "2026-05-31T20:00:00.000Z",
      statementHash: "sha256-abcdef1234567890",
    });

    expect(html).toContain("BQ SQWAD TV");
    expect(html).toContain("stmt_test_9981");
    expect(html).toContain("Apex Studios");
    expect(html).toContain("NIP-20260531-8891");
    expect(html).toContain("sha256-abcdef1234567890");
    expect(html).toContain(
      "Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer.",
    );
    expect(html).toContain("Financial records are immutable and retained permanently");
  });

  it("generates official disbursement receipt HTML and handles reversal entries", () => {
    const standardReceipt = generateReceiptHtml({
      receiptId: "rcpt_po_1234567890",
      payoutId: "po_1234567890abcdef",
      recipientUid: "user_producer_77",
      amountMinor: 2500000,
      currency: "NGN",
      status: "SETTLED",
      settlementReference: "WIRE-REF-9921",
      paymentDate: "2026-06-30T15:30:00.000Z",
    });

    expect(standardReceipt).toContain("rcpt_po_1234567890");
    expect(standardReceipt).toContain("WIRE-REF-9921");
    expect(standardReceipt).not.toContain("NOTICE: THIS PAYMENT WAS REVERSED");

    // Reversed receipt must retain original data and display reversal notice
    const reversedReceipt = generateReceiptHtml({
      receiptId: "rcpt_po_1234567890",
      payoutId: "po_1234567890abcdef",
      recipientUid: "user_producer_77",
      amountMinor: 2500000,
      currency: "NGN",
      status: "REVERSED",
      settlementReference: "WIRE-REF-9921",
      paymentDate: "2026-06-30T15:30:00.000Z",
      reversalReference: "REV-9921-BOUNCE",
      isReversed: true,
    });

    expect(reversedReceipt).toContain("NOTICE: THIS PAYMENT WAS REVERSED UNDER REVERSAL ENTRY REV-9921-BOUNCE");
    expect(reversedReceipt).toContain("ORIGINAL ENTRY IS PERMANENTLY PRESERVED");
  });

  it("formats minor currency values reliably", () => {
    const formattedNgn = formatMoney(150000, "NGN");
    expect(formattedNgn).toContain("1,500");

    const formattedUsd = formatMoney(2500, "USD");
    expect(formattedUsd).toContain("25");
  });
});
