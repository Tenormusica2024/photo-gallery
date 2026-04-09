import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!apiSecret || !apiKey || !cloudName) {
    return NextResponse.json(
      { error: "Cloudinaryの設定が不完全です" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({} as { publicId?: unknown; resourceType?: unknown }));
  const publicId =
    typeof body.publicId === "string" ? body.publicId.trim() : "";
  const resourceType =
    body.resourceType === "video" ? "video" : body.resourceType === "image" ? "image" : null;

  if (!publicId) {
    return NextResponse.json(
      { error: "publicId が必要です" },
      { status: 400 },
    );
  }

  if (!publicId.startsWith("pastelalbum")) {
    return NextResponse.json(
      { error: "許可されていないアセットです" },
      { status: 400 },
    );
  }

  if (!resourceType) {
    return NextResponse.json(
      { error: "resourceType が不正です" },
      { status: 400 },
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("invalidate", "true");
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return NextResponse.json(
      { error: err.error?.message || "Cloudinary削除失敗" },
      { status: 502 },
    );
  }

  const data = await response.json();
  return NextResponse.json({ result: data.result || "unknown" });
}
