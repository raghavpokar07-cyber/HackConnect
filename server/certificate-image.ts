import sharp from "sharp";

const maximumImageBytes = 5 * 1024 * 1024;
const maximumImagePixels = 40_000_000;

export async function normalizeCertificateImage(input: Buffer): Promise<Buffer> {
  const decoder = sharp(input, {
    failOn: "error",
    limitInputPixels: maximumImagePixels,
  });
  const metadata = await decoder.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !["jpeg", "png", "webp"].includes(metadata.format ?? "")
  ) {
    throw new Error("Unsupported certificate photo.");
  }
  const normalized = await sharp(input, {
    failOn: "error",
    limitInputPixels: maximumImagePixels,
  })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
  if (normalized.byteLength > maximumImageBytes) {
    throw new Error("Processed certificate photo exceeds the size limit.");
  }
  return normalized;
}
