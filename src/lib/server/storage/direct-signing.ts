import { ApiError } from "../firebase-admin";
import type { StorageDestinationConfiguration } from "./registry";
import { presignBackblazeHlsGet } from "./backblaze-signing";
import { createLovableHlsSignedUrls } from "./lovable-signing";

/**
 * Signs a complete playlist's media references. Backblaze signing is local
 * SigV4 work; managed storage uses its batch signing endpoint, capped at 400
 * paths per provider request to stay below request-size limits.
 */
export async function signHlsObjectsDirectly(input: {
  configuration: StorageDestinationConfiguration;
  objectPaths: string[];
  expiresInSeconds: number;
  now?: Date;
}): Promise<Map<string, string>> {
  if (input.objectPaths.length > 20_000) {
    throw new ApiError(
      413,
      "HLS_SIGNING_LIMIT_EXCEEDED",
      "This playlist contains too many media files.",
    );
  }
  const paths = [...new Set(input.objectPaths)];
  if (input.configuration.metadata.providerType === "backblaze_b2") {
    const signed = await Promise.all(
      paths.map(
        async (objectKey) =>
          [
            objectKey,
            await presignBackblazeHlsGet({
              configuration: input.configuration,
              objectKey,
              expiresInSeconds: input.expiresInSeconds,
              ...(input.now ? { now: input.now } : {}),
            }),
          ] as const,
      ),
    );
    return new Map(signed);
  }
  if (input.configuration.metadata.providerType === "lovable_storage") {
    const results = await createLovableHlsSignedUrls({
      configuration: input.configuration,
      objectKeys: paths,
      expiresInSeconds: input.expiresInSeconds,
      batchSize: 400,
    });
    return new Map(
      results.flatMap((result) =>
        result.signedUrl ? [[result.objectKey, result.signedUrl] as const] : [],
      ),
    );
  }
  throw new ApiError(
    503,
    "HLS_SIGNING_PROVIDER_UNSUPPORTED",
    "This storage location does not support direct signed playback.",
  );
}
