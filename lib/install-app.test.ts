import { describe, expect, it } from "vitest";
import { parseInstallContext } from "./install-app";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME_OLD =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone14,5)";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ANDROID_FACEBOOK =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0]";

describe("parseInstallContext", () => {
  it("rozpoznaje Safari na iPhonie", () => {
    const ctx = parseInstallContext(IPHONE_SAFARI);
    expect(ctx).toMatchObject({ platform: "ios", iosBrowser: "safari", inApp: false, canInstallFromThisBrowser: true });
  });

  it("Chrome na iOS 16.4+ może zainstalować, na starszym nie", () => {
    expect(parseInstallContext(IPHONE_CHROME)).toMatchObject({ iosBrowser: "chrome", canInstallFromThisBrowser: true });
    expect(parseInstallContext(IPHONE_CHROME_OLD)).toMatchObject({ iosBrowser: "chrome", canInstallFromThisBrowser: false });
  });

  it("przeglądarka wbudowana w Instagram nie może zainstalować", () => {
    expect(parseInstallContext(IPHONE_INSTAGRAM)).toMatchObject({ platform: "ios", inApp: true, canInstallFromThisBrowser: false });
  });

  it("rozpoznaje Androida i jego wbudowane przeglądarki", () => {
    expect(parseInstallContext(ANDROID_CHROME)).toMatchObject({ platform: "android", inApp: false, canInstallFromThisBrowser: true });
    expect(parseInstallContext(ANDROID_FACEBOOK)).toMatchObject({ platform: "android", inApp: true, canInstallFromThisBrowser: false });
  });

  it("iPad w trybie komputerowym i zwykły komputer", () => {
    const ipadDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    expect(parseInstallContext(ipadDesktop, 5).platform).toBe("ios");
    expect(parseInstallContext(ipadDesktop, 0).platform).toBe("other");
  });
});
