"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Photo } from "@/types/database";
import MasonryGrid from "@/components/MasonryGrid";

const CATEGORIES = ["すべて", "写真", "動画"];

// Demo photos (used when Supabase is not configured or DB is empty)
// デモ用写真データ（Supabase未設定時のフォールバック）
const demoBase = { user_id: "", album_id: null, description: null, storage_path: "", file_size: null, visibility: "everyone" as const, media_type: "image" as const, duration: null, thumbnail_url: null, family_id: null };
const DEMO_PHOTOS: Photo[] = [
  { ...demoBase, id: "1", title: "First Smile", url: "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&h=750&fit=crop", width: 600, height: 750, created_at: "2024-12-25", uploaded_at: "2024-12-25" },
  { ...demoBase, id: "2", title: "Sunday Morning", url: "https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=600&h=450&fit=crop", width: 600, height: 450, created_at: "2024-11-10", uploaded_at: "2024-11-10" },
  { ...demoBase, id: "3", title: "First Steps", url: "https://images.unsplash.com/photo-1491013516836-7db643ee125a?w=600&h=900&fit=crop", width: 600, height: 900, created_at: "2025-01-15", uploaded_at: "2025-01-15" },
  { ...demoBase, id: "4", title: "Little Princess", url: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600&h=500&fit=crop", width: 600, height: 500, created_at: "2025-02-14", uploaded_at: "2025-02-14" },
  { ...demoBase, id: "5", title: "Park Day", url: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&h=650&fit=crop", width: 600, height: 650, created_at: "2025-03-20", uploaded_at: "2025-03-20" },
  { ...demoBase, id: "6", title: "Sleepy Time", url: "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=600&h=750&fit=crop", width: 600, height: 750, created_at: "2024-10-05", uploaded_at: "2024-10-05" },
  { ...demoBase, id: "7", title: "Happy Birthday", url: "https://images.unsplash.com/photo-1504151932400-72d4384f04b3?w=600&h=450&fit=crop", width: 600, height: 450, created_at: "2025-04-01", uploaded_at: "2025-04-01" },
  { ...demoBase, id: "8", title: "Tiny Hands", url: "https://images.unsplash.com/photo-1537655780520-1e392ead81f2?w=600&h=750&fit=crop", width: 600, height: 750, created_at: "2024-09-12", uploaded_at: "2024-09-12" },
  { ...demoBase, id: "9", title: "Story Time", url: "https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=600&h=600&fit=crop", width: 600, height: 600, created_at: "2025-02-28", uploaded_at: "2025-02-28" },
];

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>(DEMO_PHOTOS);
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [isDemo, setIsDemo] = useState(!isConfigured);
  const [demoReason, setDemoReason] = useState<"not_configured" | "not_logged_in" | "empty">(
    isConfigured ? "empty" : "not_configured"
  );

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    async function loadPhotos() {
      try {
        // セッションキャッシュからユーザー確認（サーバーリクエスト不要）
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setIsDemo(true);
          setDemoReason("not_logged_in");
          return;
        }

        const { data, error } = await supabase
          .from("photos")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          setPhotos(data);
          setIsDemo(false);
          return;
        }
        setIsDemo(true);
        setDemoReason("empty");
      } catch (err) {
        console.error("Gallery load error:", err);
      }
    }
    loadPhotos();
  }, []);

  return (
    <>
      {/* Hero */}
      <div className="text-center py-12 px-6 bg-gradient-to-b from-pink-50 to-white">
        <h1 className="font-quicksand text-3xl sm:text-4xl font-bold text-pink-600 mb-2">
          大切な思い出
        </h1>
        <p className="text-gray-500 text-base max-w-md mx-auto mb-6">
          家族の写真、笑顔、思い出をひとつの場所に
        </p>

        {/* Category tabs */}
        <div className="flex gap-2 justify-center flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border-[1.5px] transition-all ${
                activeCategory === cat
                  ? "bg-pink-100 border-pink-200 text-pink-600"
                  : "bg-white border-pink-100 text-gray-500 hover:bg-pink-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Demo banner */}
      {isDemo && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="bg-lavender-50 border border-lavender-100 rounded-2xl px-4 py-3 text-sm text-purple-400 text-center">
            {demoReason === "not_configured" && "デモモード - Supabase未設定のため、サンプル写真を表示しています。"}
            {demoReason === "not_logged_in" && "ログインすると、家族の写真を見ることができます。"}
            {demoReason === "empty" && "まだ写真がありません。アップロードしてみましょう。"}
          </div>
        </div>
      )}

      {/* Masonry gallery（カテゴリでフィルタリング） */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <MasonryGrid
          photos={
            activeCategory === "すべて"
              ? photos
              : activeCategory === "写真"
              ? photos.filter((p) => p.media_type === "image")
              : photos.filter((p) => p.media_type === "video")
          }
        />
      </div>

      {/* Upload FAB */}
      <Link
        href="/upload"
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 text-white flex items-center justify-center text-3xl shadow-[0_4px_16px_rgba(216,27,96,0.3)] hover:scale-110 hover:shadow-[0_6px_24px_rgba(216,27,96,0.4)] transition-all"
        aria-label="写真をアップロード"
      >
        +
      </Link>
    </>
  );
}
