import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, staticSecurityHeaders } from "./security-headers";
import { csrfRejectionReason } from "./csrf";

describe("Content-Security-Policy (audyt F-14)", () => {
  const csp = buildContentSecurityPolicy({ nonce: "abc123", pathname: "/admin" });

  it("zawiera wymagane dyrektywy", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("nie pozwala na eval ani inline-script na produkcji", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("stronę rezerwacji można osadzić tylko na stronie kliniki", () => {
    const booking = buildContentSecurityPolicy({ nonce: "n", pathname: "/book" });
    expect(booking).toContain("frame-ancestors 'self' https://derclinic.pl https://www.derclinic.pl");
  });
});

describe("nagłówki bezpieczeństwa", () => {
  it("ustawia nosniff, Referrer-Policy, Permissions-Policy i HSTS na produkcji", () => {
    const headers = staticSecurityHeaders({ pathname: "/admin", isProduction: true });
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("bez HSTS lokalnie", () => {
    expect(staticSecurityHeaders({ pathname: "/", isProduction: false })["Strict-Transport-Security"]).toBeUndefined();
  });
});

describe("CSRF / Origin (audyt F-13)", () => {
  const base = {
    method: "POST",
    requestOrigin: "https://panel.example.com",
    originHeader: "https://panel.example.com",
    refererHeader: null,
    secFetchSite: "same-origin",
    cookieToken: "token-123",
    headerToken: "token-123",
  };

  it("przepuszcza poprawne żądanie z tej samej strony", () => {
    expect(csrfRejectionReason(base)).toBeNull();
  });

  it("nie sprawdza żądań GET", () => {
    expect(csrfRejectionReason({ ...base, method: "GET", headerToken: null, originHeader: "https://evil.example" })).toBeNull();
  });

  it("odrzuca żądanie z obcej domeny", () => {
    expect(csrfRejectionReason({ ...base, originHeader: "https://evil.example" })).toBe("origin_mismatch");
    expect(csrfRejectionReason({ ...base, secFetchSite: "cross-site" })).toBe("cross_site_fetch");
  });

  it("odrzuca brak lub niezgodność tokenu", () => {
    expect(csrfRejectionReason({ ...base, headerToken: null })).toBe("missing_token");
    expect(csrfRejectionReason({ ...base, headerToken: "inny-token" })).toBe("token_mismatch");
  });

  it("dotyczy PATCH i DELETE tak samo jak POST", () => {
    for (const method of ["PATCH", "DELETE", "PUT"]) {
      expect(csrfRejectionReason({ ...base, method, originHeader: "https://evil.example" })).toBe("origin_mismatch");
    }
  });
});
