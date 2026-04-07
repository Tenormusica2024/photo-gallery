"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Album } from "@/types/database";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>("");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUser(data.user.id);
      loadAlbums(data.user.id);
    });
  }, [router]);

  async function loadAlbums(userId: string) {
    const { data } = await supabase
      .from("albums")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) setAlbums(data);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);

    // Generate previews
    selected.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!user || files.length === 0) return;

    setUploading(true);
    setError("");
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${user}/${Date.now()}-${i}.${ext}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(path, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("photos")
          .getPublicUrl(path);

        // Insert photo record
        const { error: insertError } = await supabase.from("photos").insert({
          user_id: user,
          album_id: selectedAlbum || null,
          title: title || file.name.replace(/\.[^/.]+$/, ""),
          storage_path: path,
          url: urlData.publicUrl,
          file_size: file.size,
        });

        if (insertError) throw insertError;

        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-pink-50 to-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-quicksand text-2xl font-bold text-pink-600 mb-6 text-center">
          Upload Photos
        </h1>

        <form onSubmit={handleUpload} className="space-y-6">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-pink-200 rounded-3xl p-10 text-center cursor-pointer hover:border-pink-400 hover:bg-pink-50/50 transition-all"
          >
            <div className="text-4xl text-pink-300 mb-2">+</div>
            <p className="text-gray-500 text-sm">
              Click to select photos or drag and drop
            </p>
            <p className="text-gray-400 text-xs mt-1">
              JPG, PNG, WebP (max 10MB each)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Previews */}
          {previews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {previews.map((src, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden">
                  <img
                    src={src}
                    alt=""
                    className="w-full h-24 object-cover"
                  />
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

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Photo title"
              className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors"
            />
          </div>

          {/* Album selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Album (optional)
            </label>
            <select
              value={selectedAlbum}
              onChange={(e) => setSelectedAlbum(e.target.value)}
              className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors bg-white"
            >
              <option value="">No album</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Progress */}
          {uploading && (
            <div className="w-full bg-pink-100 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-pink-400 to-purple-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={uploading || files.length === 0}
            className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {uploading
              ? `Uploading... ${progress}%`
              : `Upload ${files.length} photo${files.length !== 1 ? "s" : ""}`}
          </button>
        </form>
      </div>
    </div>
  );
}
