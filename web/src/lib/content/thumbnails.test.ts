// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

const statObject = vi.fn();
const downloadObject = vi.fn();
const uploadObject = vi.fn();
vi.mock("./storage", () => ({
  statObject: (...a: unknown[]) => statObject(...a),
  downloadObject: (...a: unknown[]) => downloadObject(...a),
  uploadObject: (...a: unknown[]) => uploadObject(...a),
}));

const reportError = vi.fn();
vi.mock("@/lib/report-error", () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { generateThumbnail, thumbPathFor, THUMB_MAX } from "./thumbnails";

beforeEach(() => {
  statObject.mockReset();
  downloadObject.mockReset();
  uploadObject.mockReset();
  reportError.mockReset();
});

describe("thumbPathFor", () => {
  it("appends the .thumb.webp suffix next to the original", () => {
    expect(thumbPathFor("t1/items/5/staging/abc-photo.png")).toBe("t1/items/5/staging/abc-photo.png.thumb.webp");
  });
});

describe("generateThumbnail", () => {
  async function bigPng(): Promise<Buffer> {
    // 1000x800 PNG so the resize actually has to shrink it.
    return sharp({ create: { width: 1000, height: 800, channels: 3, background: { r: 200, g: 60, b: 60 } } })
      .png()
      .toBuffer();
  }

  it("converts an image to a WebP thumbnail no larger than 480px, smaller than the source", async () => {
    const png = await bigPng();
    statObject.mockResolvedValue({ size: png.byteLength, mimeType: "image/png" });
    downloadObject.mockResolvedValue(new Uint8Array(png));
    uploadObject.mockResolvedValue(undefined);

    const result = await generateThumbnail("t1/items/1/staging/x.png");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("t1/items/1/staging/x.png.thumb.webp");
    expect(result!.bytes).toBeLessThan(png.byteLength);

    expect(uploadObject).toHaveBeenCalledTimes(1);
    const [path, bytes, contentType] = uploadObject.mock.calls[0] as [string, Buffer, string];
    expect(path).toBe("t1/items/1/staging/x.png.thumb.webp");
    expect(contentType).toBe("image/webp");

    // WebP magic bytes: "RIFF"....."WEBP"
    const magic = Buffer.from(bytes).subarray(0, 12).toString("ascii");
    expect(magic.startsWith("RIFF")).toBe(true);
    expect(magic.endsWith("WEBP")).toBe(true);

    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(THUMB_MAX);
  });

  it("returns null for a non-image mime (pdf/video) without touching storage", async () => {
    statObject.mockResolvedValue({ size: 1024, mimeType: "application/pdf" });
    const result = await generateThumbnail("t1/items/1/staging/x.pdf");
    expect(result).toBeNull();
    expect(downloadObject).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("returns null and skips conversion when the original is over the 25 MB cap", async () => {
    statObject.mockResolvedValue({ size: 26 * 1024 * 1024, mimeType: "image/png" });
    const result = await generateThumbnail("t1/items/1/staging/big.png");
    expect(result).toBeNull();
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it("returns null (and reports) on any failure instead of throwing", async () => {
    statObject.mockResolvedValue({ size: 1024, mimeType: "image/png" });
    downloadObject.mockResolvedValue(new Uint8Array([1, 2, 3])); // not a real image
    const result = await generateThumbnail("t1/items/1/staging/broken.png");
    expect(result).toBeNull();
    expect(reportError).toHaveBeenCalledWith("content.generateThumbnail", expect.anything(), {
      originalPath: "t1/items/1/staging/broken.png",
    });
  });
});
