"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Album } from "@/types/database";

// 画像・動画の判定
function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>("");
  const [visibility, setVisibility] = useState<"everyone" | "admin_only">("everyone");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/login"); return; }
      setUser(authUser.id);
      loadAlbums(authUser.id);

      // ユーザーの所属ファミリーを取得
      const { data: membership } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", authUser.id)
        .limit(1)
        .single();
      if (membership) setFamilyId(membership.family_id);
    }
    init();
  }, [router]);

  async function loadAlbums(userId: string) {
    const { data } = await supabase
      .from("albums")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) setAlbums(data);
  }

  // ファイルサイズ上限（画像: 10MB、動画: 100MB）
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);

    // ファイルサイズチェック
    for (const file of selected) {
      const limit = isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      const limitLabel = isVideoFile(file) ? "100MB" : "10MB";
      if (file.size > limit) {
        setError(`${file.name} のサイズが${limitLabel}を超えています`);
        return;
      }
    }
    setError("");

    setFiles((prev) => [...prev, ...selected]);

    // プレビュー生成（全てobjectURLで統一し、インデックスずれを防止）
    const newPreviews = selected.map((file) => URL.createObjectURL(file));
    setPreviews((prev) => [...prev, ...newPreviews]);
  }

  function removeFile(index: number) {
    // objectURLの解放（全プレビューがobjectURLなので常に解放）
    if (previews[index]?.startsWith("blob:")) {
      URL.revokeObjectURL(previews[index]);
    }
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!user || files.length === 0) return;

    const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "").trim();
    const uploadPreset = (process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "").trim();

    if (!cloudName || !uploadPreset) {
      setError("Cloudinaryの設定が見つかりません。環境変数を確認してください。");
      setUploading(false);
      return;
    }

    setUploading(true);
    setError("");
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = isVideoFile(file);

        // Cloudinaryにアップロード（unsigned upload）
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", uploadPreset);
        formData.append("folder", "pastelalbum");

        const resourceType = isVideo ? "video" : "image";
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
          { method: "POST", body: formData }
        );

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || "Cloudinaryアップロード失敗");
        }

        const data = await res.json();
        // public_idをstorage_pathとして保存、secure_urlをurlとして保存
        const publicId: string = data.public_id;
        const secureUrl: string = data.secure_url;
        const width: number | undefined = data.width;
        const height: number | undefined = data.height;

        // photosテーブルにレコード挿入
        const { error: insertError } = await supabase.from("photos").insert({
          user_id: user,
          album_id: selectedAlbum || null,
          family_id: familyId,
          title: title || file.name.replace(/\.[^/.]+$/, ""),
          storage_path: publicId,
          url: secureUrl,
          width: width ?? null,
          height: height ?? null,
          file_size: file.size,
          media_type: isVideo ? "video" : "image",
          visibility,
        });

        if (insertError) throw insertError;

        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  const fileCount = files.length;
  const imageCount = files.filter((f) => !isVideoFile(f)).length;
  const videoCount = files.filter((f) => isVideoFile(f)).length;

  function uploadLabel(): string {
    if (uploading) return `アップロード中... ${progress}%`;
    const parts: string[] = [];
    if (imageCount > 0) parts.push(`写真 ${imageCount}枚`);
    if (videoCount > 0) parts.push(`動画 ${videoCount}本`);
    return parts.length > 0 ? `${parts.join("と")}をアップロード` : "ファイルを選択してください";
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-pink-50 to-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-quicksand text-2xl font-bold text-pink-600 mb-6 text-center">
          アップロード
        </h1>

        <form onSubmit={handleUpload} className="space-y-6">
          {/* ドロップゾーン */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-pink-200 rounded-3xl p-10 text-center cursor-pointer hover:border-pink-400 hover:bg-pink-50/50 transition-all"
          >
            <div className="text-4xl text-pink-300 mb-2">+</div>
            <p className="text-gray-500 text-sm">
              クリックして写真や動画を選択
            </p>
            <p className="text-gray-400 text-xs mt-1">
              JPG, PNG, WebP, MP4, MOV（写真: 10MB / 動画: 100MB）
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* プレビュー */}
          {previews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {previews.map((src, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden">
                  {files[i] && isVideoFile(files[i]) ? (
                    <video
                      src={src}
                      className="w-full h-24 object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={src}
                      alt=""
                      className="w-full h-24 object-cover"
                    />
                  )}
                  {/* 動画バッジ */}
                  {files[i] && isVideoFile(files[i]) && (
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                      VIDEO
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* タイトル */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              タイトル（任意）
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="写真・動画のタイトル"
              className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors"
            />
          </div>

          {/* アルバム選択 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              アルバム（任意）
            </label>
            <select
              value={selectedAlbum}
              onChange={(e) => setSelectedAlbum(e.target.value)}
              className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors bg-white"
            >
              <option value="">アルバムなし</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </div>

          {/* 公開範囲 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              公開範囲
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setVisibility("everyone")}
                className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-[1.5px] transition-all ${
                  visibility === "everyone"
                    ? "bg-pink-100 border-pink-300 text-pink-600"
                    : "bg-white border-pink-100 text-gray-500"
                }`}
              >
                全員
              </button>
              <button
                type="button"
                onClick={() => setVisibility("admin_only")}
                className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-[1.5px] transition-all ${
                  visibility === "admin_only"
                    ? "bg-purple-100 border-purple-300 text-purple-600"
                    : "bg-white border-pink-100 text-gray-500"
                }`}
              >
                管理者のみ
              </button>
            </div>
          </div>

          {/* エラー */}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* プログレスバー */}
          {uploading && (
            <div className="w-full bg-pink-100 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-pink-400 to-purple-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={uploading || fileCount === 0}
            className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {uploadLabel()}
          </button>
        </form>
      </div>
    </div>
  );
}
