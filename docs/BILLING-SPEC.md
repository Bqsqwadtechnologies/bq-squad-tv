# BQ SQWAD TV — V3 Billing Specification

## Core Rules & Invariants
1. **Pay-As-You-Go Exclusively**: No recurring subscription traps, no promo credits, no watch credit. Viewers pay strictly for verified viewing minutes.
2. **Integer Arithmetic**: All money values are stored and calculated in integer minor units (kobo, cents, yen) using exact BigInt math.
3. **Cumulative Debiting**: Debits are computed as `cumulativeCost(next) - cumulativeCost(prev)` using `roundHalfUp(ratePerMinute * seconds / 60)`. Rounding never drifts across arbitrary heartbeat chunks.
4. **1.5x Heartbeat Cap**: A heartbeat can credit at most 1.5x its expected interval. Pauses, buffering stalls, background states, and seek jumps are non-billable (0 seconds credited).
5. **300-Second Settlement Blocks**: Idempotent settlement occurs every 300 accepted seconds (`settle:{sessionId}:{blockIndex}`) and at session end or recovery.
6. **10-Minute Wallet Hold**: A 10-minute hold is reserved at session start. Wallets can never go negative.
7. **Platform Remainder**: In revenue splits, the partner share is computed with integer division and the platform retains the exact remainder, guaranteeing `share + platform == gross`.
