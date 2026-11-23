import { ApiError, type Firestore, encodeFields } from "./firebase-admin";

export async function activateProducerBlueTickPayment(
  fs: Firestore,
  input: { reference: string; uid: string; amountMinor: number; currency: string },
): Promise<{ activated: boolean; expiresAt: string }> {
  const paymentPath = "payments/paystack_" + input.reference;
  const producerPath = "producers/" + input.uid;
  const now = new Date();
  const nowIso = now.toISOString();
  return fs.transact([paymentPath, producerPath], (docs) => {
    const payment = docs[0];
    const producer = docs[1];
    if (!payment || !producer) {
      throw new ApiError(404, "BLUE_TICK_PAYMENT_NOT_FOUND", "The producer verification payment could not be found.");
    }
    if (
      payment["uid"] !== input.uid ||
      payment["reference"] !== input.reference ||
      payment["provider"] !== "paystack" ||
      payment["paymentType"] !== "producer_blue_tick" ||
      payment["amountMinor"] !== input.amountMinor ||
      payment["currency"] !== input.currency
    ) {
      throw new ApiError(409, "BLUE_TICK_PAYMENT_MISMATCH", "The payment does not match this producer verification request.");
    }
    if (payment["status"] === "credited" && producer["publicVerificationStatus"] === "ACTIVE") {
      const currentExpiry = typeof producer["publicVerificationUntil"] === "string"
        ? producer["publicVerificationUntil"] as string
        : expiresAt;
      return { result: { activated: false, expiresAt: currentExpiry }, writes: [] };
    }
    if (payment["status"] !== "pending" && payment["status"] !== "initializing") {
      throw new ApiError(409, "BLUE_TICK_PAYMENT_NOT_CREDITABLE", "This verification payment is not in a creditable state.");
    }
    const currentExpiryMs = typeof producer["publicVerificationUntil"] === "string"
      ? Date.parse(producer["publicVerificationUntil"] as string)
      : NaN;
    const renewalBaseMs = producer["publicVerificationStatus"] === "ACTIVE" &&
      Number.isFinite(currentExpiryMs) && currentExpiryMs > now.getTime()
        ? currentExpiryMs
        : now.getTime();
    const expiresAt = new Date(renewalBaseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
      result: { activated: true, expiresAt },
      writes: [
        {
          update: {
            name: fs.docName(paymentPath),
            fields: encodeFields({ status: "credited", creditedAt: nowIso, updatedAt: nowIso }),
          },
          updateMask: { fieldPaths: ["status", "creditedAt", "updatedAt"] },
        },
        {
          update: {
            name: fs.docName(producerPath),
            fields: encodeFields({
              publicVerificationStatus: "ACTIVE",
              publicVerificationStartedAt: nowIso,
              publicVerificationUntil: expiresAt,
              publicVerificationLastPaidAt: nowIso,
              publicVerificationPaymentReference: input.reference,
              updatedAt: nowIso,
            }),
          },
          updateMask: {
            fieldPaths: [
              "publicVerificationStatus",
              "publicVerificationStartedAt",
              "publicVerificationUntil",
              "publicVerificationLastPaidAt",
              "publicVerificationPaymentReference",
              "updatedAt",
            ],
          },
        },
      ],
    };
  });
}
