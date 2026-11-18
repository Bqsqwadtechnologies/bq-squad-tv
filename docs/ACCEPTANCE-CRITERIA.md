# BQ SQWAD TV — V3 Acceptance Criteria

## Live channel playback
- **L1** An eligible viewer (signed in, documents accepted, balance at least the minimum, territory, platform and age allowed, channel published, provider and licence valid, provider concurrency below its limit) starts a live session; the response holds a grant and lease token, a wallet hold is taken, the session is `kind=live` and the price snapshot is stored.
- **L2** Each ineligible case returns a distinct friendly state with no data leak, no hold, no grant and a denial event: signed out, documents not accepted, balance too low, under 18 on an adult channel, territory blocked, platform not allowed, licence not started or expired, channel unpublished or suspended, provider suspended, concurrency limit reached ("busy").
- **L3** Time accrues only while heartbeats report playing; 150 s at 15000 minor units per minute settles to 37500; paused, background and stalled seconds are not charged; settlement happens every 300 accepted seconds and at end; an abandoned session settles to its last accepted heartbeat within 60 seconds; the wallet never goes negative; playback stops cleanly at zero balance and resumes after a top-up.
- **L4** Seeking is disabled; switching channel settles the old session first; one live session per account unless the owner allows more.
- **L5** Every settled block creates one immutable usage block with provider, contract version, channel, seconds, gross revenue and currency, and the blocks sum to the wallet debits.
- **L6** Provider credentials never appear in any response; grants expire and refresh at heartbeats; suspension or licence end stops the stream within one heartbeat.
- **L7** A provider stream failure shows a friendly message, charges nothing for non-playing time, records an error event with a reference for Zillionaire and marks the channel degraded after a threshold.
- **L8** Publishing a live channel requires a passing owner playback test (no billing) and a valid contract and licence.

## Provider statements
- **S1** Monthly close is idempotent: a second run changes nothing and there is one statement per provider, per currency, per period.
- **S2** Only that provider's usage blocks settled inside the period (UTC) are included; boundary blocks at 00:00 UTC land in exactly one period; other providers' blocks never appear.
- **S3** Gross profit equals eligible revenue minus allocated deductible costs from the contract's closed list; costs not on the list are rejected; negative gross profit gives a zero share and carries forward only if the contract says so.
- **S4** Provider earnings equal gross profit times the contract share in basis points divided by 10,000 with the documented rounding; the platform keeps the exact remainder; the two add up to gross profit to the minor unit (tests in NGN, USD, JPY, KWD and the worked example 10,000,000.00 revenue, 2,000,000.00 costs, 25 percent gives 2,000,000.00 and 6,000,000.00).
- **S5** States run open, closed (locked with a hash), approved, paid; only Zillionaire moves them, with a recent sign-in; a closed statement is immutable; corrections are adjustments in a later period.
- **S6** A provider sees only its own statements; open-period figures are labelled "Estimate"; CSV and print views match the totals and carry the usage-block hash.
- **S7** A payment is recorded only with a real reference after the transfer; a failed payment stays outstanding; receipts come from payment records; outstanding amounts are shown per currency; currencies are never added together.

## Dispute threads
- **D1** A provider user with the right role opens a dispute only on its own closed or approved statement line; one open dispute per line; message size and rate limits apply.
- **D2** A thread is visible only to that provider's users and Zillionaire (and delegates with the payments module); everyone else gets 404 and a denial event; ids cannot be guessed.
- **D3** Messages are append-only with server timestamps; edits and deletes are not possible; attachments (PDF or image, size capped) are private and checked by type and content.
- **D4** Status runs open, under review, resolved, rejected or withdrawn; resolving or rejecting needs a reason; a resolution with money creates an adjustment entry that references the dispute.
- **D5** The other side is notified on each new message with no message content in the push text; Zillionaire gets a reminder when a thread is idle beyond the configured days.
- **D6** Every state change is audited; denied access attempts create privacy-safe denial events.
- **D7** The disputed line's payout is held until the dispute is resolved.
- **D8** The thread is fully keyboard operable and new messages are announced to screen readers.
