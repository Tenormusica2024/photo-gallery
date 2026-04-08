"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Profile, Album } from "@/types/database";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
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
      const { data: albumsData } = await supabase
        .from("albums")
        .select("*, photos(count)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
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

      setLoading(false);
    }
    load();
  }, [router]);

  async function createAlbum(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !newAlbumTitle.trim()) return;

    const { data, error } = await supabase
      .from("albums")
      .insert({ user_id: profile.id, title: newAlbumTitle.trim() })
      .select()
      .single();

    if (!error && data) {
      setAlbums((prev) => [{ ...data, photo_count: 0 }, ...prev]);
      setNewAlbumTitle("");
      setShowNewAlbum(false);
    }
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
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 mx-auto mb-4 flex items-center justify-center text-3xl text-white font-bold">
          {profile?.display_name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <h2 className="font-quicksand text-2xl font-bold text-pink-600">
          {profile?.display_name || "User"}
        </h2>
        <p className="text-gray-500 text-sm">{profile?.email}</p>

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
