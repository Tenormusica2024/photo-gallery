// Cloudinary署名付きアップロードの共通ヘルパー
// upload/page.tsx と profile/page.tsx で共用

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width?: number;
  height?: number;
}

interface CloudinaryDestroyResult {
  result: string;
}

/**
 * Cloudinaryに署名付きアップロードを実行する
 * @param file アップロードするファイル
 * @param folder Cloudinary上の保存先フォルダ
 * @param resourceType リソース種別（デフォルト: "image"）
 */
export async function uploadToCloudinary(
  file: File,
  folder: string,
  resourceType: "image" | "video" = "image",
): Promise<CloudinaryUploadResult> {
  const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "").trim();
  if (!cloudName) {
    throw new Error("Cloudinaryの設定が見つかりません。環境変数を確認してください。");
  }

  // サーバーから署名を取得
  const sigRes = await fetch("/api/cloudinary-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (!sigRes.ok) {
    const sigErr = await sigRes.json().catch(() => ({}));
    throw new Error(sigErr.error || "署名の取得に失敗しました");
  }
  const { signature, timestamp, api_key } = await sigRes.json();

  // Cloudinaryにアップロード
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  formData.append("api_key", api_key);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: "POST", body: formData },
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Cloudinaryアップロード失敗");
  }

  const data = await res.json();
  return {
    public_id: data.public_id,
    secure_url: data.secure_url,
    width: data.width,
    height: data.height,
  };
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: "image" | "video" = "image",
): Promise<CloudinaryDestroyResult> {
  const res = await fetch("/api/cloudinary-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicId, resourceType }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Cloudinary削除失敗");
  }

  return res.json();
}
