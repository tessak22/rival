import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function makeRequest(url: string, options?: NextRequestInit): NextRequest {
  return new NextRequest(url, options);
}

describe("app/api/_lib/auth", () => {
  describe("hasValidInternalApiKey", () => {
    it("returns false when INTERNAL_API_KEY is not set", async () => {
      vi.stubEnv("INTERNAL_API_KEY", "");
      const { hasValidInternalApiKey } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost/api/test", {
        headers: { "x-internal-api-key": "secret" }
      });
      expect(hasValidInternalApiKey(req)).toBe(false);
      vi.unstubAllEnvs();
    });

    it("returns true when x-internal-api-key header matches", async () => {
      vi.stubEnv("INTERNAL_API_KEY", "my-secret");
      const { hasValidInternalApiKey } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost/api/test", {
        headers: { "x-internal-api-key": "my-secret" }
      });
      expect(hasValidInternalApiKey(req)).toBe(true);
      vi.unstubAllEnvs();
    });

    it("returns true when Authorization Bearer token matches", async () => {
      vi.stubEnv("INTERNAL_API_KEY", "my-secret");
      const { hasValidInternalApiKey } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost/api/test", {
        headers: { authorization: "Bearer my-secret" }
      });
      expect(hasValidInternalApiKey(req)).toBe(true);
      vi.unstubAllEnvs();
    });

    it("returns false when key does not match", async () => {
      vi.stubEnv("INTERNAL_API_KEY", "my-secret");
      const { hasValidInternalApiKey } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost/api/test", {
        headers: { "x-internal-api-key": "wrong-secret" }
      });
      expect(hasValidInternalApiKey(req)).toBe(false);
      vi.unstubAllEnvs();
    });

    it("returns false when Authorization scheme is not Bearer", async () => {
      vi.stubEnv("INTERNAL_API_KEY", "my-secret");
      const { hasValidInternalApiKey } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost/api/test", {
        headers: { authorization: "Basic my-secret" }
      });
      expect(hasValidInternalApiKey(req)).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe("isSameOriginRequest", () => {
    it("returns true when Origin header matches request origin", async () => {
      const { isSameOriginRequest } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost:3000/api/test", {
        headers: { origin: "http://localhost:3000" }
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it("returns false when Origin header is a different origin", async () => {
      const { isSameOriginRequest } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost:3000/api/test", {
        headers: { origin: "https://attacker.com" }
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it("returns true when Referer header matches request origin", async () => {
      const { isSameOriginRequest } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost:3000/api/test", {
        headers: { referer: "http://localhost:3000/dashboard" }
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it("returns false when Referer has a different origin", async () => {
      const { isSameOriginRequest } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost:3000/api/test", {
        headers: { referer: "https://evil.com/page" }
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it("returns false when neither Origin nor Referer is present", async () => {
      const { isSameOriginRequest } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost:3000/api/test");
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it("returns false when Referer is malformed", async () => {
      const { isSameOriginRequest } = await import("@/app/api/_lib/auth");
      const req = makeRequest("http://localhost:3000/api/test", {
        headers: { referer: "not-a-url" }
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });
  });
});
