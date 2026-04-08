"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Album, Photo } from "@/types/database";
import MasonryGrid from "@/components/MasonryGrid";

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }

        const albumId = params.id as string;

        // Load album
        const { data: albumData } = await supabase
          .from("albums")
          .select("*")
          .eq("id", albumId)
          .single();

        if (albumData) setAlbum(albumData);

        // Load photos in album
        const { data: photosData } = await supabase
          .from("photos")
          .select("*")
          .eq("album_id", albumId)
          .order("created_at", { ascending: false });

        if (photosData) setPhotos(photosData);
      } catch (err) {
        console.error("Album load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[var(--color-background)]">
      {/* Album header */}
      <div className="bg-gradient-to-b from-pink-50 to-white py-8 px-4 text-center">
        <Link
          href="/profile"
          className="text-sm text-pink-400 hover:text-pink-600 transition-colors"
        >
          &larr; Back to Albums
        </Link>
        <h1 className="font-quicksand text-2xl font-bold text-pink-600 mt-2">
          {album?.title || "Album"}
        </h1>
        {album?.description && (
          <p className="text-gray-500 text-sm mt-1">{album.description}</p>
        )}
        <p className="text-gray-400 text-xs mt-2">{photos.length} photos</p>
      </div>

      {/* Photos */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {photos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm mb-4">
              No photos in this album yet.
            </p>
            <Link
              href="/upload"
              className="inline-block px-6 py-2 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Upload Photos
            </Link>
          </div>
        ) : (
          <MasonryGrid photos={photos} />
        )}
      </div>
    </div>
  );
}
