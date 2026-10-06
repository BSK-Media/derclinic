import { describe, expect, it } from "vitest";
import { detectImageMime } from "./newsletter-images";

describe("rozpoznawanie typu zdjęcia po zawartości", () => {
  it("rozpoznaje JPG, PNG, GIF i WebP", () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    expect(
      detectImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe("image/webp");
  });

  it("odrzuca SVG, HTML i inne pliki", () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(detectImageMime(encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImageMime(encode("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImageMime(new Uint8Array([]))).toBeNull();
  });
});
