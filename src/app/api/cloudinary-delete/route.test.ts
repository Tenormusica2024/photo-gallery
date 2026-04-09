import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServer: vi.fn(async () => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}));

describe("POST /api/cloudinary-delete", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.CLOUDINARY_API_KEY;
  const originalApiSecret = process.env.CLOUDINARY_API_SECRET;
  const originalCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  beforeEach(() => {
    process.env.CLOUDINARY_API_KEY = "test-api-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
    global.fetch = vi.fn();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.CLOUDINARY_API_KEY = originalApiKey;
    process.env.CLOUDINARY_API_SECRET = originalApiSecret;
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = originalCloudName;
    vi.restoreAllMocks();
  });

  it("destroys the requested Cloudinary asset", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ result: "ok" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cloudinary-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: "pastelalbum/photo-1",
          resourceType: "image",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudinary.com/v1_1/test-cloud/image/destroy",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });

  it("requires an authenticated user", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cloudinary-delete", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "認証が必要です" });
  });

  it("rejects asset ids outside the application folder", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cloudinary-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: "another-app/photo-1",
          resourceType: "image",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "許可されていないアセットです",
    });
  });
});
