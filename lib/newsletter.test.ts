import { describe, expect, it } from "vitest";
import { htmlToText, newsletterUnsubscribeToken, sanitizeNewsletterHtml, verifyNewsletterUnsubscribeToken } from "./newsletter";

describe("newsletter", () => {
  it("usuwa skrypty, zdarzenia i niebezpieczne adresy", () => {
    const dirty =
      '<p onclick="x()">Hej</p><script>alert(1)</script><a href="javascript:alert(1)">klik</a><img src="a.png" onerror=alert(1)><iframe src="https://x"></iframe>';
    const clean = sanitizeNewsletterHtml(dirty);
    expect(clean).not.toMatch(/<script|onclick|onerror|javascript:|<iframe/i);
    expect(clean).toContain("<p>Hej</p>");
    expect(clean).toContain('<img src="a.png"');
  });

  it("zostawia zwykłe formatowanie i obrazki data:image", () => {
    const html = '<h2 style="color:#059669">Tytuł</h2><img src="data:image/png;base64,AAAA"><a href="https://derclinic.pl">link</a>';
    expect(sanitizeNewsletterHtml(html)).toBe(html);
  });

  it("buduje wersję tekstową z linkami i listami", () => {
    const text = htmlToText('<p>Cześć&nbsp;Ania</p><ul><li>Jeden</li><li>Dwa</li></ul><a href="https://x.pl">Zobacz</a>');
    expect(text).toContain("Cześć Ania");
    expect(text).toContain("• Jeden");
    expect(text).toContain("Zobacz (https://x.pl)");
  });

  it("podpisany token wypisania działa tylko dla właściwego klienta", () => {
    const token = newsletterUnsubscribeToken("pat_123");
    expect(verifyNewsletterUnsubscribeToken(token)).toBe("pat_123");
    expect(verifyNewsletterUnsubscribeToken(token.replace("pat_123", "pat_999"))).toBeNull();
    expect(verifyNewsletterUnsubscribeToken("pat_123.zly")).toBeNull();
    expect(verifyNewsletterUnsubscribeToken("brak-kropki")).toBeNull();
  });
});
