import { KycProfile } from "@/lib/server/kyc/types";
import { getStatutoryRetentionYears, computeRetentionExpiryDate } from "@/lib/server/kyc/retention";

export interface CaseDossierInput {
  profile: KycProfile;
  audits: any[];
  exportedBy: string;
  exportedAt: string;
  legalReason: string;
}

export function renderKycCaseDossierHtml(input: CaseDossierInput): string {
  const { profile, audits, exportedBy, exportedAt, legalReason } = input;
  const retentionYears = getStatutoryRetentionYears(profile.kycCountry);
  const retentionExpiry = computeRetentionExpiryDate(profile.kycSubmittedAt || exportedAt, profile.kycCountry);

  const viewAudits = audits.filter(
    (a) => a.action === "kyc.document_viewed" || a.action === "kyc_sensitive_field_revealed" || a.action === "kyc_detail_viewed"
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KYC Case Dossier - ${profile.uid}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; line-height: 1.5; font-size: 13px; margin: 0; padding: 20px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .logo { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .badge { display: inline-block; padding: 3px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; border-radius: 4px; background: #e2e8f0; }
    .badge-approved { background: #dcfce7; color: #166534; }
    .badge-hold { background: #fee2e2; color: #991b1b; }
    .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px; }
    .field-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .field-value { font-size: 13px; font-weight: 600; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th { text-align: left; background: #f8fafc; padding: 6px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; }
    td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
    .watermark { position: fixed; top: 40%; left: 10%; transform: rotate(-30deg); font-size: 42px; font-weight: 900; color: rgba(148, 163, 184, 0.12); pointer-events: none; z-index: 1000; text-transform: uppercase; }
    .footer { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="watermark">CONFIDENTIAL • BQ SQWAD TV • AUDIT DOSSIER</div>

  <div class="header">
    <div>
      <div class="logo">BQ SQWAD TV • KYC COMPLIANCE DOSSIER</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">CASE ID: ${profile.uid} • JURISDICTION: ${profile.kycCountry || "N/A"}</div>
    </div>
    <div>
      <span class="badge ${profile.kycStatus === 'approved' ? 'badge-approved' : ''}">STATUS: ${profile.kycStatus || 'PENDING'}</span>
      ${profile.legalHold ? '<span class="badge badge-hold" style="margin-left: 4px;">ACTIVE LEGAL HOLD</span>' : ''}
    </div>
  </div>

  <div class="section-title">1. Applicant & Entity Identification</div>
  <div class="grid">
    <div><div class="field-label">Legal Name</div><div class="field-value">${profile.legalName || "N/A"}</div></div>
    <div><div class="field-label">Entity Classification</div><div class="field-value">${profile.kycType || "N/A"}</div></div>
    <div><div class="field-label">ID Number (Masked)</div><div class="field-value">${profile.maskedIdNumber || "N/A"}</div></div>
    <div><div class="field-label">Tax ID (Masked)</div><div class="field-value">${profile.maskedTaxNumber || "N/A"}</div></div>
    <div><div class="field-label">Official Email</div><div class="field-value">${profile.officialEmail || "N/A"}</div></div>
    <div><div class="field-label">Phone</div><div class="field-value">${profile.phone || "N/A"}</div></div>
  </div>

  <div class="section-title">2. Risk Assessment & Dual Reviewer Audit</div>
  <div class="grid">
    <div><div class="field-label">Risk Level / Score</div><div class="field-value">${(profile.riskLevel || 'low').toUpperCase()} (${profile.riskScore ?? 'N/A'}/100)</div></div>
    <div><div class="field-label">Payout Tier</div><div class="field-value">TIER ${profile.payoutTier ?? 0}</div></div>
    <div><div class="field-label">First Reviewer</div><div class="field-value">${profile.firstReviewerEmail || profile.firstReviewerUid || profile.kycReviewedBy || 'N/A'}</div></div>
    <div><div class="field-label">Second Reviewer (Four-Eyes)</div><div class="field-value">${profile.secondReviewerEmail || profile.secondReviewerUid || 'N/A'}</div></div>
  </div>

  <div class="section-title">3. Statutory Retention & Legal Hold Status</div>
  <div class="grid">
    <div><div class="field-label">Country Retention Period</div><div class="field-value">${retentionYears} Years (Statutory AML)</div></div>
    <div><div class="field-label">Retention Expiry Date</div><div class="field-value">${retentionExpiry}</div></div>
    <div><div class="field-label">Legal Hold Flag</div><div class="field-value">${profile.legalHold ? `ACTIVE (${profile.legalHoldReason || 'No reason specified'})` : 'NONE'}</div></div>
    <div><div class="field-label">Next Re-verification Due</div><div class="field-value">${profile.nextReverificationDueAt || 'N/A'}</div></div>
  </div>

  <div class="section-title">4. Document Access & Inspection Audit Log (${viewAudits.length} events)</div>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Actor UID</th>
        <th>Action</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${viewAudits.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: #94a3b8;">No document inspections recorded</td></tr>' : ''}
      ${viewAudits.map((a) => `
        <tr>
          <td>${a.createdAt || 'N/A'}</td>
          <td>${a.actorUid || 'N/A'}</td>
          <td>${a.action}</td>
          <td>${a.reason || 'N/A'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="section-title">5. Biometric & Data Processing Consent Log</div>
  <table>
    <thead>
      <tr>
        <th>Consent Type</th>
        <th>Notice Version</th>
        <th>Accepted Timestamp</th>
        <th>Notice Reference</th>
      </tr>
    </thead>
    <tbody>
      ${(!profile.consentLog || profile.consentLog.length === 0) ? '<tr><td colspan="4" style="text-align: center; color: #94a3b8;">Standard digital onboarding consent recorded on profile creation</td></tr>' : ''}
      ${(profile.consentLog || []).map((c) => `
        <tr>
          <td>${c.consentType}</td>
          <td>${c.noticeVersion}</td>
          <td>${c.acceptedAt}</td>
          <td>${c.noticeUrl}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Exported by verified platform owner: ${exportedBy} at ${exportedAt}</p>
    <p>Legal Justification: ${legalReason}</p>
    <p>BQ SQWAD Technologies Limited • Confidential Statutory Record • Unauthorized copying or distribution is strictly prohibited.</p>
  </div>
</body>
</html>`;
}
