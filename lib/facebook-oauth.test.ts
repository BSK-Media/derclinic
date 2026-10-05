import { afterEach, describe, expect, it } from "vitest";
import { buildFacebookAuthUrl, facebookOAuthConfig } from "@/lib/facebook-oauth";

describe("buildFacebookAuthUrl", () => {
  it("buduje adres autoryzacji Facebooka z wymaganymi parametrami", () => {
    const url = new URL(
      buildFacebookAuthUrl({
        appId: "app-id",
        redirectUri: "https://app.example/api/patient/facebook/callback",
        state: "s1",
      }),
    );
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/api/patient/facebook/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("public_profile,email");
    expect(url.searchParams.get("state")).toBe("s1");
  });
});

describe("facebookOAuthConfig", () => {
  const original = { id: process.env.FACEBOOK_APP_ID, secret: process.env.FACEBOOK_APP_SECRET };
  afterEach(() => {
    process.env.FACEBOOK_APP_ID = original.id;
    process.env.FACEBOOK_APP_SECRET = original.secret;
  });

  it("jest wyłączone, dopóki nie ma obu zmiennych", () => {
    process.env.FACEBOOK_APP_ID = "app-id";
    process.env.FACEBOOK_APP_SECRET = "";
    expect(facebookOAuthConfig()).toBeNull();
  });

  it("zwraca identyfikator i sekret bez białych znaków", () => {
    process.env.FACEBOOK_APP_ID = " app-id ";
    process.env.FACEBOOK_APP_SECRET = " secret\n";
    expect(facebookOAuthConfig()).toEqual({ appId: "app-id", appSecret: "secret" });
  });
});
