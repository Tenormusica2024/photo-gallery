import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import crypto from "crypto";

// Cloudinary署名付きアップロード用のsignature生成
// クライアントがアップロード直前にここを叩き、署名・タイムスタンプ・APIキーを受け取る
export async function POST(request: Request) {
  // 認証チェック（ログイン済みユーザーのみ署名を発行）
  const supabase = await createSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;

  if (!apiSecret || !apiKey) {
    return NextResponse.json(
      { error: "Cloudinaryの設定が不完全です" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { folder, upload_preset } = body as {
    folder?: string;
    upload_preset?: string;
  };

  const timestamp = Math.round(Date.now() / 1000);

  // 署名対象パラメータ（アルファベット順で連結）
  const params: Record<string, string> = { timestamp: String(timestamp) };
  if (folder) params.folder = folder;
  if (upload_preset) params.upload_preset = upload_preset;

  // パラメータをキー名でソートして&で連結
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  // HMAC-SHA256ではなくSHA-1（Cloudinaryの署名仕様）
  const signature = crypto
    .createHash("sha1")
    .update(sortedParams + apiSecret)
    .digest("hex");

  return NextResponse.json({
    signature,
    timestamp,
    api_key: apiKey,
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  });
}
