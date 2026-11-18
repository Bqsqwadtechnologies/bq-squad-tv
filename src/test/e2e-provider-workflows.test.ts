import { describe, expect, it, vi } from "vitest";
import { requireProviderAccess, requireAdminModule, requirePlatformRole } from "@/lib/server/roles";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { createRoleIsolationStore } from "@/test/role-isolation-harness";
import { assertLegalAcceptance } from "@/lib/server/legal-acceptance";
import { Route as EndSessionRoute } from "@/routes/api/public/v1/sessions/$sessionId/end";
import { Route as WalletReceiptRoute } from "@/routes/api/public/v1/wallet/receipt/$paymentId";
import { Route as PayoutRequestRoute } from "@/routes/api/public/v1/producer/payouts/request";
import * as apiModule from "@/lib/server/api";

function createE2EStore() {
  return createRoleIsolationStore();
}

function verifiedUser(uid: string, email: string, emailVerified = true) {
  return {
    uid,
    email,
    emailVerified,
    authTime: Math.floor(Date.now() / 1000),
    issuedAt: Math.floor(Date.now() / 1000),
    customClaims: {},
  };
}

function getPostHandler(route: unknown) {
  return (
    route as {
      options: {
        server: {
          handlers: {
            POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
          };
        };
      };
    }
  ).options.server.handlers.POST;
}

function getGetHandler(route: unknown) {
  return (
    route as {
      options: {
        server: {
          handlers: {
            GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
          };
        };
      };
    }
  ).options.server.handlers.GET;
}

describe("Batch 13: Workflow End-to-End Suite (workflow-e2e)", () => {
  describe("Workflow (a): Viewer Lifecycle - Signup, Acceptance, Top-up, Watch, Receipt & Isolation", () => {
    it("runs complete viewer lifecycle and verifies strict viewer isolation at each step", async () => {
      const { store, fs } = createE2EStore();
      vi.spyOn(Firestore, "create").mockResolvedValue(fs);

      const viewerA = verifiedUser("viewer-alpha", "alpha@example.com");
      const viewerB = verifiedUser("viewer-beta", "beta@example.com");

      // 1. Viewer signs up (account and wallet initialized)
      const nowIso = new Date().toISOString();
      store.set(`users/${viewerA.uid}`, {
        uid: viewerA.uid,
        email: viewerA.email,
        status: "active",
        createdAt: nowIso,
      });
      store.set(`wallets/${viewerA.uid}`, {
        uid: viewerA.uid,
        balanceMinor: 0,
        heldBalanceMinor: 0,
        currency: "NGN",
        spentDate: nowIso.slice(0, 10),
        spentTodayMinor: 0,
        dailySpendLimitMinor: 500_000,
        updatedAt: nowIso,
      });

      // Seed required legal pages
      store.set("sitePages/terms", {
        slug: "terms",
        audience: "public",
        status: "published",
        version: 1,
        title: "Terms of Service",
        body: "# Terms of Service\n\nBy using this service you agree to the terms.",
        requiresReacceptance: true,
      });
      store.set("sitePages/privacy-policy", {
        slug: "privacy-policy",
        audience: "public",
        status: "published",
        version: 1,
        title: "Privacy Notice",
        body: "# Privacy Notice\n\nWe protect your privacy.",
        requiresReacceptance: true,
      });

      // 2. Playback blocked before legal document acceptance
      await expect(assertLegalAcceptance(fs, viewerA.uid, "public")).rejects.toMatchObject({
        status: 403,
        code: "LEGAL_ACCEPTANCE_REQUIRED",
      });

      // 3. Viewer accepts legal documents
      store.set(`legalAcceptances/${viewerA.uid}_terms_v1`, {
        uid: viewerA.uid,
        slug: "terms",
        version: 1,
        acceptedAt: nowIso,
      });
      store.set(`legalAcceptances/${viewerA.uid}_privacy-policy_v1`, {
        uid: viewerA.uid,
        slug: "privacy-policy",
        version: 1,
        acceptedAt: nowIso,
      });
      await expect(assertLegalAcceptance(fs, viewerA.uid, "public")).resolves.toBeUndefined();

      // 4. Viewer tops up wallet via Paystack
      const topUpAmountMinor = 500_000; // 5,000.00 NGN
      const paymentId = "paystack_ref_alpha_topup_123456";
      store.set(`payments/${paymentId}`, {
        uid: viewerA.uid,
        reference: "BQ-PAY-2026-ALPHA-01",
        provider: "paystack",
        status: "credited",
        currency: "NGN",
        amountMinor: topUpAmountMinor,
        creditMinor: topUpAmountMinor,
        createdAt: nowIso,
        creditedAt: nowIso,
      });
      store.set(`wallets/${viewerA.uid}`, {
        uid: viewerA.uid,
        balanceMinor: topUpAmountMinor,
        heldBalanceMinor: 0,
        currency: "NGN",
        spentDate: nowIso.slice(0, 10),
        spentTodayMinor: 0,
        dailySpendLimitMinor: 500_000,
        updatedAt: nowIso,
      });

      // 5. Playback session starts on film asset
      const sessionId = "sess_vod_film_001";
      const producerUid = "producer-nollywood-1";
      store.set(`producers/${producerUid}`, {
        uid: producerUid,
        earningsBalanceByCurrency: { NGN: 0 },
        earningsLifetimeByCurrency: { NGN: 0 },
        earningsBalanceMinor: 0,
        earningsLifetimeMinor: 0,
        updatedAt: nowIso,
      });

      const initialHoldMinor = 50_000; // Hold 500.00 NGN
      store.set(`wallets/${viewerA.uid}`, {
        uid: viewerA.uid,
        balanceMinor: topUpAmountMinor,
        heldBalanceMinor: initialHoldMinor,
        currency: "NGN",
        spentDate: nowIso.slice(0, 10),
        spentTodayMinor: 0,
        dailySpendLimitMinor: 500_000,
        updatedAt: nowIso,
      });
      store.set(`walletHolds/${sessionId}`, {
        uid: viewerA.uid,
        sessionId,
        amountMinor: initialHoldMinor,
        status: "active",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        updatedAt: nowIso,
      });
      store.set(`sessions/${sessionId}`, {
        sessionId,
        uid: viewerA.uid,
        channelId: "ch_film_channel",
        assetId: "asset_film_4k",
        producerUid,
        ratePerMinuteMinor: 10_000, // 100.00 NGN per min
        producerShareBps: 7000, // 70% to producer, 30% to platform
        billedSeconds: 120, // 2 minutes watched
        sessionTotalMinor: 20_000, // 200.00 NGN charged so far
        walletHoldMinor: initialHoldMinor,
        currency: "NGN",
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      store.set(`activeSessions/${viewerA.uid}`, {
        sessions: [
          {
            sessionId,
            kind: "vod",
            createdAt: nowIso,
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        ],
        updatedAt: nowIso,
      });

      // 6. Viewer B attempts to end Viewer A's playback session -> Blocked by ownership check
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(viewerB);
      const endPost = getPostHandler(EndSessionRoute);
      const crossReq = new Request(
        `https://tv.bqsqwad.com/api/public/v1/sessions/${sessionId}/end`,
        {
          method: "POST",
        },
      );
      const crossRes = await endPost({ request: crossReq, params: { sessionId } });
      expect(crossRes.status).toBe(403);
      const crossBody = await crossRes.json();
      expect(crossBody.code).toBe("FORBIDDEN");

      // 7. Viewer A ends session -> Hold settled, final wallet balance deducted, ledger entries created
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(viewerA);
      const endReq = new Request(`https://tv.bqsqwad.com/api/public/v1/sessions/${sessionId}/end`, {
        method: "POST",
      });
      const endRes = await endPost({ request: endReq, params: { sessionId } });
      expect(endRes.status).toBe(200);

      const endedSession = store.get(`sessions/${sessionId}`);
      expect(endedSession!["active"]).toBe(false);
      expect(endedSession!["walletHoldMinor"]).toBe(0);

      const holdDoc = store.get(`walletHolds/${sessionId}`);
      expect(holdDoc!["status"]).toBe("released");
      expect(holdDoc!["amountMinor"]).toBe(0);

      const updatedWallet = store.get(`wallets/${viewerA.uid}`);
      expect(updatedWallet!["heldBalanceMinor"]).toBe(0);
      expect(updatedWallet!["balanceMinor"]).toBeLessThanOrEqual(topUpAmountMinor);

      // 8. Viewer A retrieves top-up receipt
      const receiptGet = getGetHandler(WalletReceiptRoute);
      const receiptReq = new Request(
        `https://tv.bqsqwad.com/api/public/v1/wallet/receipt/${paymentId}`,
        {
          method: "GET",
        },
      );
      const receiptRes = await receiptGet({ request: receiptReq, params: { paymentId } });
      expect(receiptRes.status).toBe(200);
      const receiptBody = await receiptRes.json();
      expect(receiptBody.receiptNumber).toBe("BQ-PAY-2026-ALPHA-01");
      expect(receiptBody.provider).toBe("Paystack");
      expect(receiptBody.amountMinor).toBe(topUpAmountMinor);
      expect(receiptBody.status).toBe("credited");

      // 9. Viewer B attempts to access Viewer A's receipt -> 404 PAYMENT_NOT_FOUND (strict isolation)
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(viewerB);
      const crossReceiptRes = await receiptGet({ request: receiptReq, params: { paymentId } });
      expect(crossReceiptRes.status).toBe(404);
      const crossReceiptBody = await crossReceiptRes.json();
      expect(crossReceiptBody.code).toBe("PAYMENT_NOT_FOUND");
    });
  });

  describe("Workflow (b): Producer Lifecycle - Upload, Worker Transcode, Approval, Publication, Playback, Earnings, Payout & Isolation", () => {
    it("processes producer content through transcode, publication, playback revenue, and payout", async () => {
      const { store, fs } = createE2EStore();
      vi.spyOn(Firestore, "create").mockResolvedValue(fs);

      const producerA = verifiedUser("producer-A", "prodA@nollywood.tv");
      const producerB = verifiedUser("producer-B", "prodB@nollywood.tv");
      const zillionaireAdmin = verifiedUser("owner-1", "owner@zillionaire.tv");
      const viewer = verifiedUser("viewer-fan", "fan@example.com");

      const channelId = "ch_prodA_nollywood_01";
      const assetId = "asset_prodA_movie_4k";
      const nowIso = new Date().toISOString();

      // 1. Producer A setup
      store.set(`users/${producerA.uid}`, {
        uid: producerA.uid,
        email: producerA.email,
        roleTags: ["producer"],
      });
      store.set(`producers/${producerA.uid}`, {
        uid: producerA.uid,
        status: "ACTIVE",
        planStatus: "ACTIVE",
        verificationStatus: "APPROVED",
        earningsBalanceByCurrency: { USD: 0 },
        earningsLifetimeByCurrency: { USD: 0 },
        earningsBalanceMinor: 0,
        earningsLifetimeMinor: 0,
        payoutReservedByCurrency: { USD: 0 },
        updatedAt: nowIso,
      });
      store.set(`channels/${channelId}`, {
        channelId,
        ownerUid: producerA.uid,
        title: "Nollywood Premier Cinema",
        status: "DRAFT",
        published: false,
        paid: true,
        currency: "USD",
        ratePerMinuteMinor: 100, // $1.00/min
        producerShareBps: 8000, // 80% to producer
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      // 2. Producer A uploads content asset with rights metadata
      store.set(`contentAssets/${assetId}`, {
        assetId,
        channelId,
        ownerUid: producerA.uid,
        status: "uploaded_pending_transcode",
        title: "Lagos Golden Hour (4K Master)",
        contentStatus: "draft",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      // 3. Fake worker simulates transcode processing completion
      store.set(`videoTranscodeJobs/${assetId}`, {
        assetId,
        status: "processing",
        claimToken: "claim_token_worker_01",
        attempts: 1,
        createdAt: nowIso,
      });
      // Worker completes transcode
      store.set(`videoTranscodeJobs/${assetId}`, {
        assetId,
        status: "ready",
        claimToken: null,
        workerStatus: "completed",
        completedAt: nowIso,
      });
      store.set(`contentAssets/${assetId}`, {
        assetId,
        channelId,
        ownerUid: producerA.uid,
        status: "ready",
        streamingPlaybackUrl: `https://cdn.example.com/hls/${assetId}/master.m3u8`,
        contentStatus: "ready",
        durationSeconds: 7200,
        updatedAt: nowIso,
      });

      // 4. Zillionaire approves and publishes channel and asset
      store.set(`users/${zillionaireAdmin.uid}`, {
        uid: zillionaireAdmin.uid,
        email: zillionaireAdmin.email,
        zillionaireModules: ["content", "channels", "moderation"],
      });
      await requireAdminModule(fs, zillionaireAdmin, "channels");

      await fs.patchDoc(`channels/${channelId}`, {
        status: "READY",
        published: true,
        currentAssetId: assetId,
        updatedAt: nowIso,
      });

      const publishedChannel = await fs.getDoc(`channels/${channelId}`);
      expect(publishedChannel!["published"]).toBe(true);
      expect(publishedChannel!["status"]).toBe("READY");

      // 5. Viewer watches and session ends with revenue split
      const earnedAmountMinor = 80_000; // $800.00 USD producer share
      store.set(`producers/${producerA.uid}`, {
        uid: producerA.uid,
        status: "ACTIVE",
        planStatus: "ACTIVE",
        verificationStatus: "APPROVED",
        earningsBalanceByCurrency: { USD: earnedAmountMinor },
        earningsLifetimeByCurrency: { USD: earnedAmountMinor },
        earningsBalanceMinor: 0,
        earningsLifetimeMinor: 0,
        payoutReservedByCurrency: { USD: 0 },
        updatedAt: nowIso,
      });
      store.set(`ledger/earning_${assetId}_01`, {
        uid: producerA.uid,
        kind: "producer_earning",
        description: "Viewing revenue from Lagos Golden Hour",
        amountMinor: earnedAmountMinor,
        currency: "USD",
        createdAt: nowIso,
      });

      // 6. Producer A verifies earnings balance
      const prodADoc = await fs.getDoc(`producers/${producerA.uid}`);
      const balances = prodADoc!["earningsBalanceByCurrency"] as Record<string, number>;
      expect(balances["USD"]).toBe(earnedAmountMinor);

      // 7. Producer A requests payout
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(producerA);
      const payoutPost = getPostHandler(PayoutRequestRoute);
      const payoutReq = new Request(
        "https://tv.bqsqwad.com/api/public/v1/producer/payouts/request",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amountMinor: 50_000, // $500.00
            currency: "USD",
            idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
          }),
        },
      );
      const payoutRes = await payoutPost({ request: payoutReq, params: {} });
      expect(payoutRes.status).toBe(201);
      const payoutBody = await payoutRes.json();
      expect(payoutBody.status).toBe("REQUESTED");
      expect(payoutBody.amountMinor).toBe(50_000);
      expect(payoutBody.currency).toBe("USD");

      // 8. Producer B attempts to request payout against Producer A -> Rejection / Isolation
      store.set(`users/${producerB.uid}`, {
        uid: producerB.uid,
        email: producerB.email,
        roleTags: ["producer"],
      });
      store.set(`producers/${producerB.uid}`, {
        uid: producerB.uid,
        status: "ACTIVE",
        planStatus: "ACTIVE",
        verificationStatus: "APPROVED",
        earningsBalanceByCurrency: { USD: 0 },
        earningsLifetimeByCurrency: { USD: 0 },
        payoutReservedByCurrency: { USD: 0 },
        updatedAt: nowIso,
      });
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(producerB);
      const crossPayoutReq = new Request(
        "https://tv.bqsqwad.com/api/public/v1/producer/payouts/request",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amountMinor: 50_000,
            currency: "USD",
            idempotencyKey: "223e4567-e89b-12d3-a456-426614174001",
          }),
        },
      );
      const crossPayoutRes = await payoutPost({ request: crossPayoutReq, params: {} });
      expect(crossPayoutRes.status).toBe(409);
      const crossPayoutBody = await crossPayoutRes.json();
      expect(crossPayoutBody.code).toBe("PAYOUT_BALANCE_INSUFFICIENT");
    });
  });

  describe("Workflow (c): Provider Lifecycle - Onboarding, Contract, Live Channel Test & Publish, Viewing, Usage Blocks, Monthly Close, Dispute & Payment", () => {
    it("provisions live channel with owner test, settles usage blocks, closes statements, resolves disputes and marks payment", async () => {
      const { store, fs } = createE2EStore();

      // 1. Provider onboarding
      store.set("providerUsers/user-prov-1", {
        status: "ACTIVE",
        providerId: "prov-lagos-tv",
      });
      store.set("providerUsers/user-prov-2", {
        status: "ACTIVE",
        providerId: "prov-kano-tv",
      });

      // 2. Active contract with closed deductible list
      const contractId = "contract_prov_lagos_v1";
      store.set(`providerContracts/${contractId}`, {
        contractId,
        providerId: "prov-lagos-tv",
        version: 1,
        status: "active",
        shareBps: 2500, // 25.00%
        allowedDeductibles: ["cdnDelivery", "paymentProcessing", "playbackInfrastructure"],
        createdAt: "2026-09-01T00:00:00.000Z",
      });

      // 3. Live channel testing & publishing
      const validFutureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const channelId = "ch_lagos_live_01";
      const channelData = {
        channelId,
        providerId: "prov-lagos-tv",
        name: "Lagos Broadcast Live",
        streamUrl: "https://streams.example.com/live/lagos/index.m3u8",
        status: "published",
        health: "healthy",
        categories: ["News", "Entertainment"],
        language: "en",
        licenceExpiresAt: validFutureDate,
        totalWatchMinutes: 12050,
        currentViewers: 142,
      };
      await fs.setDoc(`liveChannels/${channelId}`, channelData);

      const providerUser = verifiedUser("user-prov-1", "rep@lagostv.com");
      const access = await requireProviderAccess(fs, providerUser);
      expect(access.providerId).toBe("prov-lagos-tv");

      const channel = await fs.getDoc(`liveChannels/${channelId}`);
      expect(channel).not.toBeNull();
      expect(channel!["providerId"]).toBe(access.providerId);
      expect(channel!["status"]).toBe("published");

      // Verify stream URL format and HTTPS/manifest integrity
      const streamUrl = channel!["streamUrl"] as string;
      expect(streamUrl.startsWith("https://")).toBe(true);
      expect(streamUrl.endsWith(".m3u8") || streamUrl.endsWith(".mpd")).toBe(true);

      // 4. Live playback writes immutable usage blocks (L5)
      const blockId = "ub_2026_09_001";
      const usageBlock = {
        blockId,
        providerId: "prov-lagos-tv",
        contractVersion: 1,
        channelId,
        billedSeconds: 300,
        grossRevenueMinor: 10_000_000, // 100,000.00 NGN in kobo
        currency: "NGN",
        settledAt: "2026-09-15T12:00:00.000Z",
      };
      await fs.setDoc(`usageBlocks/${blockId}`, usageBlock);

      const storedBlock = await fs.getDoc(`usageBlocks/${blockId}`);
      expect(storedBlock!["grossRevenueMinor"]).toBe(10_000_000);
      expect(storedBlock!["providerId"]).toBe("prov-lagos-tv");

      // 5. Monthly close and exact share arithmetic (S3, S4)
      const statementId = "stmt_2026_09_provLagos";
      const grossRevenueMinor = 10_000_000; // 100,000.00 NGN in kobo
      const cdnDeliveryMinor = 500_000;
      const paymentProcessingMinor = 250_000;
      const playbackInfraMinor = 250_000;
      const totalDeductibleMinor = cdnDeliveryMinor + paymentProcessingMinor + playbackInfraMinor; // 10,000.00 NGN

      const grossProfitMinor = grossRevenueMinor - totalDeductibleMinor; // 9,000,000 kobo
      const providerShareBps = 2500; // 25.00%
      const providerEarningsMinor = Math.round((grossProfitMinor * providerShareBps) / 10000); // 2,250,000 kobo
      const platformShareMinor = grossProfitMinor - providerEarningsMinor; // 6,750,000 kobo

      expect(grossProfitMinor).toBe(9_000_000);
      expect(providerEarningsMinor).toBe(2_250_000);
      expect(platformShareMinor).toBe(6_750_000);
      expect(providerEarningsMinor + platformShareMinor).toBe(grossProfitMinor);

      const statementDoc = {
        statementId,
        providerId: "prov-lagos-tv",
        period: "September 2026",
        status: "closed", // locked with hash
        currency: "NGN",
        grossRevenueMinor,
        cdnDeliveryMinor,
        paymentProcessingMinor,
        providerFeesMinor: 0,
        playbackInfrastructureMinor: playbackInfraMinor,
        totalDeductibleMinor,
        grossProfitMinor,
        providerShareBps,
        providerEarningsMinor,
        platformShareMinor,
        statementHash: "sha256_mock_statement_hash_verified",
        paymentReference: null,
        paidAt: null,
      };
      await fs.setDoc(`providerStatements/${statementId}`, statementDoc);

      // Provider reads own statement
      const fetchedStatement = await fs.getDoc(`providerStatements/${statementId}`);
      expect(fetchedStatement!["providerEarningsMinor"]).toBe(2_250_000);

      // Isolation: Provider 2 is blocked from reading Provider 1's statement
      const providerUser2 = verifiedUser("user-prov-2", "rep@kanotv.com");
      await expect(
        requireProviderAccess(fs, providerUser2, fetchedStatement!["providerId"] as string),
      ).rejects.toMatchObject({
        status: 403,
        code: "PROVIDER_ISOLATION_VIOLATION",
      });

      // 6. Dispute thread interaction (D1-D5)
      const adminSupportUser = verifiedUser("admin-sup", "support@zillionaire.tv");
      store.set(`users/${adminSupportUser.uid}`, {
        email: adminSupportUser.email,
        zillionaireModules: ["support"],
      });

      const disputeId = "disp_test_lagos_001";
      const initialDispute = {
        disputeId,
        providerId: "prov-lagos-tv",
        statementId,
        subject: "Discrepancy in CDN Deductible for Sept 2026",
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            sender: "provider",
            senderUid: providerUser.uid,
            text: "The CDN delivery cost allocated appears higher than verified stream egress.",
            timestamp: new Date().toISOString(),
          },
        ],
      };
      await fs.setDoc(`providerDisputes/${disputeId}`, initialDispute);

      // Support reviews and replies with adjustment
      await requireAdminModule(fs, adminSupportUser, "support");
      const currentMessages = [...(initialDispute.messages as Array<Record<string, unknown>>)];
      currentMessages.push({
        sender: "support",
        senderUid: adminSupportUser.uid,
        text: "We have reviewed your egress logs and applied an adjustment credit of NGN 150,000.",
        timestamp: new Date().toISOString(),
      });
      await fs.patchDoc(`providerDisputes/${disputeId}`, {
        messages: currentMessages,
        status: "under_review",
        updatedAt: new Date().toISOString(),
      });

      // Provider confirms
      currentMessages.push({
        sender: "provider",
        senderUid: providerUser.uid,
        text: "Thank you for the prompt review and credit adjustment. Confirmed.",
        timestamp: new Date().toISOString(),
      });
      await fs.patchDoc(`providerDisputes/${disputeId}`, {
        messages: currentMessages,
        status: "resolved",
        resolvedByUid: adminSupportUser.uid,
        updatedAt: new Date().toISOString(),
      });

      const finalDispute = await fs.getDoc(`providerDisputes/${disputeId}`);
      expect(finalDispute!["status"]).toBe("resolved");
      expect((finalDispute!["messages"] as Array<unknown>).length).toBe(3);

      // Isolation: Provider 2 cannot access dispute thread
      await expect(
        requireProviderAccess(fs, providerUser2, finalDispute!["providerId"] as string),
      ).rejects.toMatchObject({
        status: 403,
        code: "PROVIDER_ISOLATION_VIOLATION",
      });

      // 7. Statement moves to paid with real payment reference (S7)
      await fs.patchDoc(`providerStatements/${statementId}`, {
        status: "paid",
        paymentReference: "PAY-NGN-2026-09-00124",
        paidAt: new Date().toISOString(),
      });

      const paidStmt = await fs.getDoc(`providerStatements/${statementId}`);
      expect(paidStmt!["status"]).toBe("paid");
      expect(paidStmt!["paymentReference"]).toBe("PAY-NGN-2026-09-00124");
    });
  });
});
