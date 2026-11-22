/**
 * Partner Email Notification Templates (Rule N27)
 * Guaranteed:
 *  - ZERO internal operator terms ("zillionaire", "admin", "schema", etc.)
 *  - ZERO revenue percentages (percentages remain confidential)
 *  - All templates conclude with: "Need help? Contact tv@bqsqwad.com"
 */

export interface EmailRenderResult {
  subject: string;
  body: string;
}

const SUPPORT_FOOTER = "\n\nNeed help? Contact tv@bqsqwad.com";

export function renderChannelSetUpEmail(params: {
  partnerName: string;
  channelName: string;
  slug: string;
}): EmailRenderResult {
  return {
    subject: `Your broadcast channel "${params.channelName}" has been set up`,
    body: `Hello ${params.partnerName},

A broadcast channel has been created for your organization on BQ SQWAD TV:
Channel Name: ${params.channelName}
Public Address: /channels/${params.slug}

You can access your dedicated Partner Console to review your channel checklist, configure your live broadcast stream, and submit your launch materials.

Sign in with your verified corporate email to get started.${SUPPORT_FOOTER}`,
  };
}

export function renderPartnerInvitationEmail(params: {
  inviterName: string;
  channelName: string;
  role: string;
}): EmailRenderResult {
  return {
    subject: `Invitation to collaborate on "${params.channelName}" on BQ SQWAD TV`,
    body: `Hello,

${params.inviterName} has invited you to join the team for "${params.channelName}" on BQ SQWAD TV as a ${params.role}.

To accept this invitation and access the broadcast tools, sign in to BQ SQWAD TV with this email address.${SUPPORT_FOOTER}`,
  };
}

export function renderChangeRequestReceivedEmail(params: {
  partnerName: string;
  channelName: string;
  scope: string;
  requestId: string;
}): EmailRenderResult {
  return {
    subject: `Update received for "${params.channelName}" (${params.scope})`,
    body: `Hello ${params.partnerName},

We have received your update request for "${params.channelName}".
Scope: ${params.scope}
Reference ID: ${params.requestId}

Our team is currently reviewing the submission and running automated broadcast checks. You will receive an update once the review is complete.${SUPPORT_FOOTER}`,
  };
}

export function renderChangeRequestApprovedEmail(params: {
  partnerName: string;
  channelName: string;
  scope: string;
  requestId: string;
}): EmailRenderResult {
  return {
    subject: `Update approved for "${params.channelName}" — Ready for launch`,
    body: `Hello ${params.partnerName},

Your update request for "${params.channelName}" has been approved.
Scope: ${params.scope}
Reference ID: ${params.requestId}

The submission has passed technical verification and is scheduled for release. You will receive a final confirmation once the update is live on the streaming network.${SUPPORT_FOOTER}`,
  };
}

export function renderChangeRequestRejectedEmail(params: {
  partnerName: string;
  channelName: string;
  scope: string;
  requestId: string;
  reason: string;
}): EmailRenderResult {
  return {
    subject: `Action required for "${params.channelName}" update request`,
    body: `Hello ${params.partnerName},

Your update request for "${params.channelName}" could not be approved at this time.
Scope: ${params.scope}
Reference ID: ${params.requestId}

Review feedback:
${params.reason}

Please sign in to the Partner Console to update your submission accordingly.${SUPPORT_FOOTER}`,
  };
}

export function renderChangeRequestLiveEmail(params: {
  partnerName: string;
  channelName: string;
  scope: string;
  requestId: string;
}): EmailRenderResult {
  return {
    subject: `Your update for "${params.channelName}" is now live`,
    body: `Hello ${params.partnerName},

The approved update for "${params.channelName}" is now live on BQ SQWAD TV.
Scope: ${params.scope}
Reference ID: ${params.requestId}

Viewers can now experience the updated broadcast configuration.${SUPPORT_FOOTER}`,
  };
}

export function renderAutoTestFailedEmail(params: {
  partnerName: string;
  channelName: string;
  failureSummary: string;
  fixSteps: string;
  referenceId: string;
}): EmailRenderResult {
  return {
    subject: `Technical broadcast test alert for "${params.channelName}"`,
    body: `Hello ${params.partnerName},

Our automated preflight check detected an issue with your stream configuration for "${params.channelName}".
Test Reference: ${params.referenceId}

Issue:
${params.failureSummary}

Recommended resolution:
${params.fixSteps}

Please update your stream encoder or channel settings in the Partner Console.${SUPPORT_FOOTER}`,
  };
}

export function renderMonthlyStatementReadyEmail(params: {
  partnerName: string;
  statementPeriod: string;
  totalEarningsFormatted: string;
}): EmailRenderResult {
  return {
    subject: `Monthly earnings statement ready for ${params.statementPeriod}`,
    body: `Hello ${params.partnerName},

Your monthly broadcast statement for ${params.statementPeriod} is now ready for review.

Net Earnings Accrued: ${params.totalEarningsFormatted}

You can download your verified statement and historical ledger directly from your Partner Console.${SUPPORT_FOOTER}`,
  };
}
