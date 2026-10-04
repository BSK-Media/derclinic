import { describe, expect, it } from "vitest";
import { buildGoogleAuthUrl, decodeGoogleState, encodeGoogleState, sanitizeReturnTo } from "@/lib/google-oauth";

describe("sanitizeReturnTo", () => {
  it("przepuszcza rezerwację i panel klienta razem z parametrami", () => {
    expect(sanitizeReturnTo("/book?wznow=1&serviceId=abc")).toBe("/book?wznow=1&serviceId=abc");
    expect(sanitizeReturnTo("/panel-klienta")).toBe("/panel-klienta");
    expect(sanitizeReturnTo("/panel-klienta?tab=profile")).toBe("/panel-klienta?tab=profile");
  });

  it("odrzuca obce adresy i inne części aplikacji", () => {
    for (const value of [
      null,
      "",
      "https://evil.example/book",
      "//evil.example/book",
      "/\\evil.example",
      "/admin",
      "/bookmark",
      "/panel-klienta-x",
      "book",
    ]) {
      expect(sanitizeReturnTo(value)).toBe("/panel-klienta");
    }
  });
});

describe("stan OAuth w ciasteczku", () => {
  it("koduje i odczytuje stan", () => {
    const state = { state: "s1", nonce: "n1", returnTo: "/book?wznow=1" };
    expect(decodeGoogleState(encodeGoogleState(state))).toEqual(state);
  });

  it("odrzuca uszkodzone wartości i czyści adres powrotu", () => {
    expect(decodeGoogleState(undefined)).toBeNull();
    expect(decodeGoogleState("to-nie-jest-json")).toBeNull();
    expect(decodeGoogleState(encodeGoogleState({ state: "s", nonce: "n", returnTo: "https://evil.example" }))?.returnTo).toBe(
      "/panel-klienta",
    );
  });
});

describe("buildGoogleAuthUrl", () => {
  it("buduje adres autoryzacji Google z wymaganymi parametrami", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: "client-id",
        redirectUri: "https://app.example/api/patient/google/callback",
        state: "s1",
        nonce: "n1",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/api/patient/google/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("nonce")).toBe("n1");
  });
});
