"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ConfigRequired from "@/components/ConfigRequired";
import { supabase, isConfigured } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import type { Profile, Album } from "@/types/database";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [loading, setLoading] = useState(true);

  // プロフィール編集
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login?redirect=/profile");
          return;
        }
        const user = session.user;

        // Load profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (profileData) setProfile(profileData);

        // Load albums with photo counts
        const { data: albumsData, error: albumsError } = await supabase
          .from("albums")
          .select("*, photos(count)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        console.log("[profile] albums query:", { userId: user.id, count: albumsData?.length, error: albumsError, data: albumsData });
        if (albumsData) {
          setAlbums(
            albumsData.map((a: Record<string, unknown>) => ({
              ...a,
              photo_count: (a.photos as Array<{ count: number }>)?.[0]?.count ?? 0,
            })) as Album[]
          );
        }

        // Total photo count
        const { count } = await supabase
          .from("photos")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        setPhotoCount(count || 0);
      } catch (err) {
        console.error("Profile load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // プロフィール保存
  async function saveProfile() {
    if (!profile || !editName.trim()) return;
    setError("");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: editName.trim() })
      .eq("id", profile.id);
    if (!error) {
      setProfile({ ...profile, display_name: editName.trim() });
      setEditing(false);
    } else {
      setError("プロフィールを保存できませんでした。");
    }
    setSaving(false);
  }

  // アバターアップロード（Cloudinary経由）
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setError("");

    // ファイル形式チェック（画像のみ許可）
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setError("対応している画像形式: JPG, PNG, WebP, GIF");
      e.target.value = "";
      return;
    }

    // 5MB制限
    if (file.size > 5 * 1024 * 1024) {
      setError("5MB以下の画像を選択してください");
      e.target.value = "";
      return;
    }

    setAvatarUploading(true);
    try {
      const { secure_url: avatarUrl } = await uploadToCloudinary(file, "pastelalbum/avatars");

      // プロフィールに保存
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", profile.id);

      if (!error) {
        setProfile({ ...profile, avatar_url: avatarUrl });
      } else {
        setError("アバターを保存できませんでした。");
      }
    } catch (err) {
      console.error("Avatar upload error:", err);
      setError("アバターのアップロードに失敗しました。");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  async function createAlbum(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !newAlbumTitle.trim()) return;
    setError("");

    const { data, error } = await supabase
      .from("albums")
      .insert({ user_id: profile.id, title: newAlbumTitle.trim() })
      .select()
      .single();
    console.log("[profile] album create:", { profileId: profile.id, data, error });

    if (!error && data) {
      setAlbums((prev) => [{ ...data, photo_count: 0 }, ...prev]);
      setNewAlbumTitle("");
      setShowNewAlbum(false);
    } else {
      setError("アルバムを作成できませんでした。");
    }
  }

  if (!isConfigured) {
    return (
      <ConfigRequired
        title="プロフィールはまだ利用できません"
        message="Supabase の環境変数が未設定のため、プロフィールやアルバム情報を読み込めません。"
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[var(--color-background)] px-4 py-8">
      {/* Profile header */}
      <div className="text-center mb-8">
        {/* アバター（クリックで変更） */}
        <div className="relative inline-block mb-4">
          <div
            onClick={() => avatarInputRef.current?.click()}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 mx-auto flex items-center justify-center text-3xl text-white font-bold overflow-hidden cursor-pointer group"
          >
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.display_name || ""}
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            ) : (
              profile?.display_name?.charAt(0)?.toUpperCase() || "?"
            )}
            {/* ホバーオーバーレイ */}
            <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-semibold">
                {avatarUploading ? "..." : "変更"}
              </span>
            </div>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>

        {/* 名前（編集モード切替） */}
        {editing ? (
          <div className="flex items-center justify-center gap-2 mb-1">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="px-3 py-1.5 border-[1.5px] border-pink-200 rounded-xl text-lg font-bold text-pink-600 text-center outline-none focus:border-pink-400 font-quicksand w-48"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveProfile();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button
              onClick={saveProfile}
              disabled={saving}
              className="text-sm text-pink-500 hover:text-pink-600 font-semibold"
            >
              {saving ? "..." : "保存"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-gray-400 hover:text-gray-500"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-1">
            <h2 className="font-quicksand text-2xl font-bold text-pink-600">
              {profile?.display_name || "User"}
            </h2>
            <button
              onClick={() => {
                setEditName(profile?.display_name || "");
                setEditing(true);
              }}
              className="text-gray-300 hover:text-pink-400 transition-colors"
              aria-label="名前を編集"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        )}
        <p className="text-gray-500 text-sm">{profile?.email}</p>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

        {/* Stats */}
        <div className="flex gap-8 justify-center mt-4">
          <div className="text-center">
            <div className="text-xl font-bold text-pink-600">{photoCount}</div>
            <div className="text-xs text-gray-400">写真</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-pink-600">{albums.length}</div>
            <div className="text-xs text-gray-400">アルバム</div>
          </div>
        </div>
      </div>

      {/* Albums section */}
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-quicksand text-lg font-semibold text-gray-700">
            マイアルバム
          </h3>
          <button
            onClick={() => setShowNewAlbum(!showNewAlbum)}
            className="text-sm font-semibold text-pink-500 hover:text-pink-600 transition-colors"
          >
            {showNewAlbum ? "キャンセル" : "+ 新しいアルバム"}
          </button>
        </div>

        {/* New album form */}
        {showNewAlbum && (
          <form onSubmit={createAlbum} className="flex gap-3 mb-4">
            <input
              type="text"
              value={newAlbumTitle}
              onChange={(e) => setNewAlbumTitle(e.target.value)}
              placeholder="アルバム名"
              required
              className="flex-1 px-4 py-2 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity"
            >
              作成
            </button>
          </form>
        )}

        {/* Album grid */}
        {albums.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">アルバムがまだありません。最初のアルバムを作成しましょう!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {albums.map((album) => (
              <Link
                key={album.id}
                href={`/album/${album.id}`}
                className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(216,27,96,0.08)] hover:shadow-[0_8px_30px_rgba(216,27,96,0.15)] hover:-translate-y-1 transition-all"
              >
                <div className="h-32 bg-gradient-to-br from-pink-100 to-lavender-100 flex items-center justify-center">
                  <span className="text-3xl text-pink-300">&#9675;</span>
                </div>
                <div className="p-3">
                  <h4 className="font-semibold text-sm text-gray-700 truncate">
                    {album.title}
                  </h4>
                  <p className="text-xs text-gray-400">
                    {album.photo_count || 0} 枚
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
