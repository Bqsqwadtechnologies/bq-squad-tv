/**
 * Client-Side Image Compression for Low-Bandwidth Mode
 *
 * Automatically downsizes and compresses large document and selfie photos
 * in the user's browser before network transmission.
 */

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number; // percentage saved, e.g. 75%
  wasCompressed: boolean;
}

export async function compressImageClientSide(
  file: File,
  options: {
    maxDimension?: number;
    quality?: number;
    enabled?: boolean;
  } = {}
): Promise<CompressionResult> {
  const { maxDimension = 1920, quality = 0.82, enabled = true } = options;

  const originalSize = file.size;

  // Only compress raster images; PDFs and non-images pass through unchanged
  if (!enabled || !file.type.startsWith("image/") || file.type.includes("svg")) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      wasCompressed: false,
    };
  }

  // If already under 400KB, no aggressive compression needed
  if (originalSize < 400 * 1024) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      wasCompressed: false,
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { file, originalSize, compressedSize: originalSize, compressionRatio: 0, wasCompressed: false };
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outputType = file.type === "image/png" ? "image/jpeg" : file.type;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, quality);
    });

    if (!blob || blob.size >= originalSize) {
      return { file, originalSize, compressedSize: originalSize, compressionRatio: 0, wasCompressed: false };
    }

    const newFileName = file.name.replace(/\.[^/.]+$/, "") + (outputType === "image/jpeg" ? ".jpg" : "");
    const compressedFile = new File([blob], newFileName, {
      type: outputType,
      lastModified: Date.now(),
    });

    const compressedSize = compressedFile.size;
    const compressionRatio = Math.round(((originalSize - compressedSize) / originalSize) * 100);

    return {
      file: compressedFile,
      originalSize,
      compressedSize,
      compressionRatio,
      wasCompressed: true,
    };
  } catch {
    // If canvas or bitmap fails (e.g. non-browser environment or corrupted image), fail open and return original
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      wasCompressed: false,
    };
  }
}
