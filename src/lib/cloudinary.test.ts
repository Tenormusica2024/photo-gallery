import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFromCloudinary, uploadToCloudinary } from "./cloudinary";

describe("uploadToCloudinary", () => {
  const originalFetch = global.fetch;
  const originalCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "demo-cloud";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = originalCloudName;
    vi.restoreAllMocks();
  });

  it("requests a signature with the selected folder and uploads the asset", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signature: "sig",
            timestamp: 123,
            api_key: "key",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            public_id: "photo-id",
            secure_url: "https://res.cloudinary.com/demo/image/upload/photo-id.jpg",
            width: 800,
            height: 600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const file = new File(["demo"], "demo.jpg", { type: "image/jpeg" });
    const result = await uploadToCloudinary(file, "pastelalbum/avatars");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/cloudinary-signature",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ folder: "pastelalbum/avatars" }),
      })
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.cloudinary.com/v1_1/demo-cloud/image/upload"
    );
    expect(result).toEqual({
      public_id: "photo-id",
      secure_url: "https://res.cloudinary.com/demo/image/upload/photo-id.jpg",
      width: 800,
      height: 600,
    });
  });

  it("surfaces the signature endpoint error message", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "認証が必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    );

    const file = new File(["demo"], "demo.jpg", { type: "image/jpeg" });

    await expect(uploadToCloudinary(file, "pastelalbum")).rejects.toThrow(
      "認証が必要です"
    );
  });

  it("requires a Cloudinary cloud name", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "";
    const file = new File(["demo"], "demo.jpg", { type: "image/jpeg" });

    await expect(uploadToCloudinary(file, "pastelalbum")).rejects.toThrow(
      "Cloudinaryの設定が見つかりません。環境変数を確認してください。"
    );
  });

  it("calls the application delete endpoint for cleanup", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ result: "ok" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await deleteFromCloudinary("pastelalbum/photo-1", "image");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/cloudinary-delete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          publicId: "pastelalbum/photo-1",
          resourceType: "image",
        }),
      })
    );
    expect(result).toEqual({ result: "ok" });
  });

  it("surfaces the cleanup endpoint error message", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Cloudinary削除失敗" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      deleteFromCloudinary("pastelalbum/photo-1", "image")
    ).rejects.toThrow("Cloudinary削除失敗");
  });
});
