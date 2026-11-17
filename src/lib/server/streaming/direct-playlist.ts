import { ApiError } from "../firebase-admin";
import { resolveHlsReference } from "./hls-playlist";

const URI_ATTRIBUTE = /(URI\\s*=\\s*")([^"]+)(")/gi;

export type SignedPlaylistResult = {
  playlist: string;
  objectPaths: string[];
};

/**
 * Rewrites every storage reference in an HLS playlist to a pre-signed object
 * URL. The signer is called once with the de-duplicated object list, allowing
 * providers with batch signing to avoid one outbound call per segment.
 */
export async function rewritePlaylistWithSignedObjects(input: {
  playlist: string;
  playlistPath: string;
  signObjects: (objectPaths: string[]) => Promise<Map<string, string>>;
  keyUrl?: (assetId: string) => Promise<string>;
}): Promise<SignedPlaylistResult> {
  const { playlist, playlistPath } = input;
  if (playlist.length > 2_000_000 || !playlist.replace(/^\\uFEFF/, "").trimStart().startsWith("#EXTM3U")) {
    throw new ApiError(415, "HLS_PLAYLIST_INVALID", "The media playlist is invalid.");
  }

  const objectPaths = new Set<string>();
  const keyAssets = new Set<string>();
  const resolve = (reference: string): string | null => {
    const keyMatch = reference.match(/\\/api\\/public\\/v1\\/streaming\\/key\\/([A-Za-z0-9_-]{1,100})(?:$|[?#])/);
    if (keyMatch?.[1]) {
      keyAssets.add(keyMatch[1]);
      return null;
    }
    const path = resolveHlsReference(playlistPath, reference);
    const name = path.split("/").pop()?.toLowerCase() ?? "";
    if (!/^(?:master|index|variant(?:_[a-z0-9_-]+)?)\\.m3u8$/.test(name) &&
        !/^segment_[0-9]{5}\\.(?:ts|m4s)$/.test(name) &&
        name !== "init.mp4" &&
        !/^subtitle_[a-z0-9_-]+\\.vtt$/.test(name) &&
        !/^(?:encryption|stream)_[a-z0-9_-]+\\.(?:key|keyinfo)$/.test(name)) {
      throw new ApiError(403, "HLS_SIGNED_OBJECT_TYPE_FORBIDDEN", "The playlist references a file type that cannot be shared directly.");
    }
    objectPaths.add(path);
    return path;
  };

  for (const line of playlist.split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      for (const match of line.matchAll(URI_ATTRIBUTE)) {
        const uri = match[2] ?? "";
        if (uri && !uri.startsWith("data:")) resolve(uri);
      }
    } else resolve(trimmed);
  }

  const signed = await input.signObjects([...objectPaths]);
  for (const path of objectPaths) {
    if (!signed.has(path) || !signed.get(path)?.startsWith("https://")) {
      throw new ApiError(503, "HLS_SIGNED_OBJECT_UNAVAILABLE", "Some media files could not be authorised for direct playback.");
    }
  }
  const keyUrls = new Map<string, string>();
  for (const assetId of keyAssets) {
    if (!input.keyUrl) throw new ApiError(503, "HLS_KEY_ROUTE_UNAVAILABLE", "Encrypted playback is not available for this stream.");
    keyUrls.set(assetId, await input.keyUrl(assetId));
  }

  const output = await Promise.all(playlist.split(/\\r?\\n/).map(async line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      const matches = [...line.matchAll(URI_ATTRIBUTE)];
      let rewritten = line;
      for (const match of matches) {
        const uri = match[2] ?? "";
        if (!uri || uri.startsWith("data:")) continue;
        const keyMatch = uri.match(/\\/api\\/public\\/v1\\/streaming\\/key\\/([A-Za-z0-9_-]{1,100})(?:$|[?#])/);
        const url = keyMatch?.[1] ? keyUrls.get(keyMatch[1]) : signed.get(resolveHlsReference(playlistPath, uri));
        if (!url) throw new ApiError(503, "HLS_SIGNED_OBJECT_UNAVAILABLE", "A media reference could not be authorised.");
        rewritten = rewritten.replace(match[0], match[1] + url + match[3]);
      }
      return rewritten;
    }
    const path = resolveHlsReference(playlistPath, trimmed);
    const url = signed.get(path);
    if (!url) throw new ApiError(503, "HLS_SIGNED_OBJECT_UNAVAILABLE", "A media reference could not be authorised.");
    return url;
  }));
  return { playlist: output.join("\\n"), objectPaths: [...objectPaths] };
}
