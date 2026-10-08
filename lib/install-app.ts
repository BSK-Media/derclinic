// Instalacja aplikacji (PWA) na telefonie: rozpoznanie platformy i przeglądarki, żeby baner mógł
// pokazać właściwą drogę — natywne okno na Androidzie albo instrukcję dopasowaną do przeglądarki
// na iPhonie (iOS nie pozwala zainstalować aplikacji jednym przyciskiem, w żadnej przeglądarce).

export type InstallPlatform = "android" | "ios" | "other";
export type IosBrowser = "safari" | "chrome" | "firefox" | "edge" | "other";

export type InstallContext = {
  platform: InstallPlatform;
  // Przeglądarka wbudowana w aplikację (Instagram, Facebook…) — nie pozwala dodać strony do ekranu.
  inApp: boolean;
  iosBrowser: IosBrowser | null;
  iosVersion: [number, number] | null;
  // iOS od 16.4 pozwala dodać stronę do ekranu początkowego także z Chrome, Firefoksa i Edge.
  canInstallFromThisBrowser: boolean;
};

const IN_APP_PATTERN =
  /FBAN|FBAV|FB_IAB|Instagram|Messenger|MessengerLiteForiOS|TikTok|musical_ly|Snapchat|Line\/|LinkedInApp|Twitter|MicroMessenger|GSA\/|Pinterest/i;

export function parseInstallContext(userAgent: string, maxTouchPoints = 0): InstallContext {
  const ua = userAgent || "";
  // iPadOS 13+ w trybie "wersja na komputer" podaje się jako Macintosh z ekranem dotykowym.
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const inApp = IN_APP_PATTERN.test(ua) || (isAndroid && /; wv\)/.test(ua));

  if (isIos) {
    const match = /OS (\d+)[_.](\d+)/.exec(ua);
    const iosVersion: [number, number] | null = match ? [Number(match[1]), Number(match[2])] : null;
    const iosBrowser: IosBrowser = /CriOS/.test(ua)
      ? "chrome"
      : /FxiOS/.test(ua)
        ? "firefox"
        : /EdgiOS/.test(ua)
          ? "edge"
          : /Safari/.test(ua)
            ? "safari"
            : "other";
    const modern = iosVersion ? iosVersion[0] > 16 || (iosVersion[0] === 16 && iosVersion[1] >= 4) : false;
    const canInstallFromThisBrowser = !inApp && (iosBrowser === "safari" || (modern && iosBrowser !== "other"));
    return { platform: "ios", inApp, iosBrowser, iosVersion, canInstallFromThisBrowser };
  }

  if (isAndroid) {
    return { platform: "android", inApp, iosBrowser: null, iosVersion: null, canInstallFromThisBrowser: !inApp };
  }

  return { platform: "other", inApp: false, iosBrowser: null, iosVersion: null, canInstallFromThisBrowser: false };
}

export const INSTALL_DISMISS_KEY = "derclinic-install-dismissed-until";
export const INSTALL_DONE_KEY = "derclinic-install-done";
export const INSTALL_SNOOZE_DAYS = 14;
