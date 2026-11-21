import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computePerceptualFingerprint,
  detectDuplicatesAndFlag,
  assertCanPublishWithoutDuplicateConflict,
  checkExternalCopyrightService,
  REJECTION_REASON_CODES,
  REJECTION_REASON_LABELS,
} from "@/lib/server/copyright/fingerprint";
import { ApiError } from "@/lib/server/firebase-admin";

describe("Batch 2: Copyright, Fingerprint & Review Queue", () => {
  describe("Perceptual Fingerprint Computation", () => {
    it("computes deterministic file hash and perceptual fingerprint from header and sample bytes", () => {
      const header = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
      const sample = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
      const result1 = computePerceptualFingerprint(header, sample, 1048576);
      const result2 = computePerceptualFingerprint(header, sample, 1048576);

      expect(result1.fileHash).toHaveLength(64);
      expect(result1.perceptualFingerprint).toMatch(/^fp_[a-f0-9]{32}$/);
      expect(result1.fileHash).toBe(result2.fileHash);
      expect(result1.perceptualFingerprint).toBe(result2.perceptualFingerprint);
    });

    it("generates distinct fingerprints for different byte structures or sizes", () => {
      const headerA = new Uint8Array([0x00, 0x00, 0x00, 0x20]);
      const headerB = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
      const resA = computePerceptualFingerprint(headerA, undefined, 5000);
      const resB = computePerceptualFingerprint(headerB, undefined, 5000);

      expect(resA.fileHash).not.toBe(resB.fileHash);
      expect(resA.perceptualFingerprint).not.toBe(resB.perceptualFingerprint);
    });
  });

  describe("Duplicate Detection & Catalog Matching", () => {
    it("flags an asset when exact file hash matches an existing catalog entry", async () => {
      const existingAssets = [
        {
          __id: "asset_orig",
          title: "Original Blockbuster",
          ownerUid: "producer_1",
          fileHash: "hash_match_123",
          perceptualFingerprint: "fp_abc",
        },
      ];

      const mockFs: any = {
        query: vi.fn().mockResolvedValue(existingAssets),
      };

      const result = await detectDuplicatesAndFlag(
        mockFs,
        "asset_cand",
        "producer_2",
        "hash_match_123",
        "fp_other",
      );

      expect(result.duplicateDetected).toBe(true);
      expect(result.duplicateOfAssetId).toBe("asset_orig");
      expect(result.duplicateOfTitle).toBe("Original Blockbuster");
      expect(result.duplicateType).toBe("exact");
      expect(result.reviewQueueFlag).toBe("Possible duplicate of Original Blockbuster");
    });

    it("flags an asset when perceptual fingerprint matches an existing entry", async () => {
      const existingAssets = [
        {
          __id: "asset_orig_2",
          title: "Indie Documentary",
          ownerUid: "producer_1",
          fileHash: "hash_different",
          perceptualFingerprint: "fp_exact_match",
        },
      ];

      const mockFs: any = {
        query: vi.fn().mockResolvedValue(existingAssets),
      };

      const result = await detectDuplicatesAndFlag(
        mockFs,
        "asset_cand_2",
        "producer_3",
        "hash_candidate_unique",
        "fp_exact_match",
      );

      expect(result.duplicateDetected).toBe(true);
      expect(result.duplicateOfAssetId).toBe("asset_orig_2");
      expect(result.duplicateOfTitle).toBe("Indie Documentary");
      expect(result.duplicateType).toBe("near_duplicate");
      expect(result.reviewQueueFlag).toBe("Possible duplicate of Indie Documentary");
    });

    it("returns clean result when candidate video is unique", async () => {
      const existingAssets = [
        {
          __id: "asset_orig_3",
          title: "Existing Show",
          ownerUid: "producer_1",
          fileHash: "hash_old",
          perceptualFingerprint: "fp_old",
        },
      ];

      const mockFs: any = {
        query: vi.fn().mockResolvedValue(existingAssets),
      };

      const result = await detectDuplicatesAndFlag(
        mockFs,
        "asset_unique",
        "producer_1",
        "hash_brand_new",
        "fp_brand_new",
      );

      expect(result.duplicateDetected).toBe(false);
      expect(result.duplicateOfAssetId).toBeNull();
      expect(result.reviewQueueFlag).toBeNull();
    });
  });

  describe("Cross-Producer Publish Conflict Guard", () => {
    it("blocks publishing identical content under different producers", async () => {
      const mockFs: any = {
        query: vi.fn().mockResolvedValue([
          {
            __id: "asset_published_1",
            title: "Summer Jam Video",
            ownerUid: "producer_alice",
            contentStatus: "published",
            fileHash: "conflict_hash_999",
          },
        ]),
      };

      const candidateAsset = {
        id: "asset_cand_bob",
        title: "Summer Jam (Re-upload)",
        ownerUid: "producer_bob",
        fileHash: "conflict_hash_999",
      };

      await expect(
        assertCanPublishWithoutDuplicateConflict(mockFs, candidateAsset),
      ).rejects.toThrowError(ApiError);

      try {
        await assertCanPublishWithoutDuplicateConflict(mockFs, candidateAsset);
      } catch (err: any) {
        expect(err.code).toBe("DUPLICATE_CROSS_PRODUCER_PUBLISH_BLOCKED");
        expect(err.message).toContain("Summer Jam Video");
      }
    });

    it("permits publish when content belongs to the same producer or is unique", async () => {
      const mockFs: any = {
        query: vi.fn().mockResolvedValue([
          {
            __id: "asset_published_1",
            title: "Summer Jam Video",
            ownerUid: "producer_alice",
            contentStatus: "published",
            fileHash: "conflict_hash_999",
          },
        ]),
      };

      const sameProducerAsset = {
        id: "asset_cand_alice_v2",
        title: "Summer Jam Video Remaster",
        ownerUid: "producer_alice",
        fileHash: "conflict_hash_999",
      };

      await expect(
        assertCanPublishWithoutDuplicateConflict(mockFs, sameProducerAsset),
      ).resolves.not.toThrow();
    });
  });

  describe("Standardized Reason Codes & Rejection Options", () => {
    it("defines the standard rejection reason codes with human-readable labels", () => {
      expect(REJECTION_REASON_CODES).toContain("copyright_suspected");
      expect(REJECTION_REASON_CODES).toContain("duplicate");
      expect(REJECTION_REASON_CODES).toContain("wrong_age_rating");
      expect(REJECTION_REASON_CODES).toContain("poor_quality");
      expect(REJECTION_REASON_CODES).toContain("missing_proof_of_rights");
      expect(REJECTION_REASON_CODES).toContain("policy_violation");
      expect(REJECTION_REASON_CODES).toContain("other");

      for (const code of REJECTION_REASON_CODES) {
        expect(REJECTION_REASON_LABELS[code]).toBeDefined();
        expect(typeof REJECTION_REASON_LABELS[code]).toBe("string");
      }
    });
  });

  describe("External Copyright Service Hook", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env['COPYRIGHT_MATCH_SERVICE_URL'];
      delete process.env['COPYRIGHT_MATCH_API_KEY'];
    });

    it("returns matched: false safely when external service is not configured", async () => {
      const result = await checkExternalCopyrightService({
        assetId: "asset_test",
        fileHash: "hash123",
        perceptualFingerprint: "fp123",
        filename: "movie.mp4",
        sizeBytes: 1000,
      });

      expect(result.matched).toBe(false);
    });

    it("evaluates response correctly when external service returns match", async () => {
      process.env['COPYRIGHT_MATCH_SERVICE_URL'] = "https://mock-copyright.local/check";
      process.env['COPYRIGHT_MATCH_API_KEY'] = "test_key";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matched: true,
          confidence: 0.95,
          matchedTitle: "Global Blockbuster",
          claimant: "Universal Media",
        }),
      });
      global.fetch = mockFetch;

      const result = await checkExternalCopyrightService({
        assetId: "asset_test",
        fileHash: "hash123",
        perceptualFingerprint: "fp123",
        filename: "movie.mp4",
        sizeBytes: 1000,
      });

      expect(result.matched).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.details).toContain("Global Blockbuster");
      expect(result.claimant).toBe("Universal Media");
    });
  });
});
