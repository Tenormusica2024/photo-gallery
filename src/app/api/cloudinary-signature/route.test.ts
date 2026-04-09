/** @vitest-environment node */

import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const createSupabaseServerMock = vi.fn(() => ({
  auth: {
    getUser: getUserMock,
  },
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServer: createSupabaseServerMock,
}));

describe("POST /api/cloudinary-signature", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CLOUDINARY_API_KEY = "test-api-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
  });

  it("returns 401 when the user is not authenticated", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cloudinary-signature", { method: "POST" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "認証が必要です" });
  });

  it("signs the requested pastelalbum subfolder", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cloudinary-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "pastelalbum/avatars" }),
      })
    );

    const body = await response.json();
    const timestamp = Math.round(Date.now() / 1000);
    const expectedSignature = crypto
      .createHash("sha1")
      .update(`folder=pastelalbum/avatars&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
      .digest("hex");

    expect(response.status).toBe(200);
    expect(body).toEqual({
      signature: expectedSignature,
      timestamp,
      api_key: "test-api-key",
      cloud_name: "test-cloud",
    });

    nowSpy.mockRestore();
  });

  it("rejects folders outside pastelalbum", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cloudinary-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "other-folder" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "許可されていないアップロード先です",
    });
  });
});
