import { ApiError } from '../firebase-admin';
import { sendVerificationCodeEmail } from '../email/brevo';

const BREVO_SMS_ENDPOINT = 'https://api.brevo.com/v3/transactionalSMS/sms';
const DEFAULT_SENDER = 'BQSquadTV';

export interface SendSmsOtpInput {
  recipientPhone: string; // E.164 format, e.g. +14155552671
  code: string;
  userEmail?: string;
}

export interface SendSmsOtpResult {
  method: 'sms' | 'email';
  messageId: string;
  fallbackUsed: boolean;
}

/**
 * Sends a 6-digit OTP code to a recipient phone number via Brevo Transactional SMS.
 * If SMS is unavailable or fails, gracefully falls back to email if userEmail is provided.
 */
export async function sendKycOtpCode(input: SendSmsOtpInput): Promise<SendSmsOtpResult> {
  const { recipientPhone, code, userEmail } = input;

  if (!/^\+[1-9]\d{6,14}$/.test(recipientPhone.trim())) {
    throw new ApiError(400, 'INVALID_PHONE_NUMBER', 'Phone number must be in valid international E.164 format (e.g. +1234567890).');
  }

  if (!/^\d{6}$/.test(code.trim())) {
    throw new ApiError(400, 'INVALID_CODE', 'Verification code must be exactly 6 digits.');
  }

  const apiKey = process.env['BREVO_API_KEY']?.trim();
  const sender = (process.env['BREVO_SMS_SENDER'] || DEFAULT_SENDER).trim().slice(0, 11);

  if (!apiKey) {
    // If Brevo key not present and email available, try email fallback
    if (userEmail) {
      await sendVerificationCodeEmail({
        to: userEmail,
        code,
        purpose: 'verify_email',
        expiresInMinutes: 10,
      });
      return { method: 'email', messageId: `email_fallback_${Date.now()}`, fallbackUsed: true };
    }
    throw new ApiError(503, 'SMS_NOT_CONFIGURED', 'SMS delivery service is not configured.');
  }

  try {
    const response = await fetch(BREVO_SMS_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender,
        recipient: recipientPhone.trim(),
        content: `Your BQ SQWAD TV verification code is ${code}. Valid for 10 minutes. Do not share this code.`,
        type: 'transactional',
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const errMsg = errJson?.message || response.statusText;

      // Check if fallback to email is requested and possible
      if (userEmail) {
        await sendVerificationCodeEmail({
          to: userEmail,
          code,
          purpose: 'verify_email',
          expiresInMinutes: 10,
        });
        return {
          method: 'email',
          messageId: `email_fallback_${Date.now()}`,
          fallbackUsed: true,
        };
      }

      throw new ApiError(
        502,
        'SMS_DELIVERY_FAILED',
        `SMS delivery failed: ${errMsg}. You can use email verification as a fallback.`
      );
    }

    const resData = (await response.json()) as { messageId?: string; reference?: string };
    return {
      method: 'sms',
      messageId: String(resData.messageId || resData.reference || `sms_${Date.now()}`),
      fallbackUsed: false,
    };
  } catch (err: any) {
    if (err instanceof ApiError) throw err;

    if (userEmail) {
      try {
        await sendVerificationCodeEmail({
          to: userEmail,
          code,
          purpose: 'verify_email',
          expiresInMinutes: 10,
        });
        return { method: 'email', messageId: `email_fallback_${Date.now()}`, fallbackUsed: true };
      } catch (emailErr) {
        // Both failed
        throw new ApiError(502, 'DELIVERY_FAILED', `Could not deliver verification code via SMS or email.`);
      }
    }

    throw new ApiError(502, 'SMS_DELIVERY_FAILED', `SMS delivery failed: ${err.message || String(err)}`);
  }
}
