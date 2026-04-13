"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import Image from "next/image";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Photo, Album } from "@/types/database";

interface Props {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onPhotoUpdate?: (photo: Photo) => void;
}

export default function Lightbox({ photos, currentIndex, onClose, onNavigate, onPhotoUpdate }: Props) {
  const photo = photos[currentIndex];
  const isVideo = photo.media_type === "video";

  // アルバム追加機能の状態管理
  const [albums, setAlbums] = useState<Album[]>([]);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [albumSaving, setAlbumSaving] = useState(false);
  const [albumMessage, setAlbumMessage] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const albumPickerRef = useRef<HTMLDivElement>(null);

  // ログイン状態確認 + アルバム一覧取得
  useEffect(() => {
    if (!isConfigured) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setIsLoggedIn(true);
      const { data } = await supabase.from("albums").select("*").order("title");
      if (data) setAlbums(data);
    })();
  }, []);

  // アルバムピッカー外クリックで閉じる
  useEffect(() => {
    if (!showAlbumPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (albumPickerRef.current && !albumPickerRef.current.contains(e.target as Node)) {
        setShowAlbumPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAlbumPicker]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAlbumPicker) {
          setShowAlbumPicker(false);
          return;
        }
        onClose();
      }
      if (e.key === "ArrowRight" && currentIndex < photos.length - 1)
        onNavigate(currentIndex + 1);
      if (e.key === "ArrowLeft" && currentIndex > 0)
        onNavigate(currentIndex - 1);
    },
    [currentIndex, photos.length, onClose, onNavigate, showAlbumPicker]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Cloudinary URLにfl_attachmentを付与してブラウザダウンロードを強制
  function handleDownload() {
    const url = new URL(photo.url);
    url.searchParams.set("fl_attachment", photo.title || (isVideo ? "動画" : "写真"));
    const a = document.createElement("a");
    a.href = url.toString();
    a.download = photo.title || (isVideo ? "動画" : "写真");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 写真をアルバムに追加/移動
  async function handleAlbumSelect(albumId: string | null) {
    setAlbumSaving(true);
    setAlbumMessage(null);
    // .select()を追加してRLSサイレント拒否（0行更新）を検出
    const { data, error } = await supabase
      .from("photos")
      .update({ album_id: albumId })
      .eq("id", photo.id)
      .select();
    setAlbumSaving(false);
    if (error) {
      console.error("Album update error:", error);
      setAlbumMessage("保存に失敗しました");
    } else if (!data || data.length === 0) {
      // RLSポリシーが更新をブロック（エラーなしで0行更新）
      console.error("Album update: 0 rows affected", { photoId: photo.id, albumId });
      setAlbumMessage("更新できませんでした（権限エラー）");
    } else {
      const albumName = albumId ? albums.find(a => a.id === albumId)?.title : null;
      setAlbumMessage(albumName ? `「${albumName}」に追加しました` : "アルバムから外しました");
      onPhotoUpdate?.({ ...photo, album_id: albumId });
      setTimeout(() => setAlbumMessage(null), 2000);
    }
    setShowAlbumPicker(false);
  }

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-lg flex items-center justify-center flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* ツールバー: アルバム + ダウンロード + 閉じる */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        {/* アルバムに追加ボタン（ログイン時のみ表示） */}
        {isLoggedIn && (
          <div className="relative" ref={albumPickerRef}>
            <button
              onClick={() => setShowAlbumPicker(!showAlbumPicker)}
              className={`w-11 h-11 rounded-full text-white hover:bg-white/30 transition-colors flex items-center justify-center ${
                photo.album_id ? "bg-purple-500/60" : "bg-white/20"
              }`}
              aria-label="アルバムに追加"
              title="アルバムに追加"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>

            {/* アルバムピッカードロップダウン */}
            {showAlbumPicker && (
              <div className="absolute top-14 right-0 w-56 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 overflow-hidden">
                {albums.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-white/60">
                    アルバムがまだありません
                  </p>
                ) : (
                  <ul className="max-h-60 overflow-y-auto">
                    {/* アルバムから外すオプション */}
                    {photo.album_id && (
                      <li>
                        <button
                          onClick={() => handleAlbumSelect(null)}
                          disabled={albumSaving}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-300 hover:bg-white/10 transition-colors"
                        >
                          アルバムから外す
                        </button>
                      </li>
                    )}
                    {albums.map((album) => (
                      <li key={album.id}>
                        <button
                          onClick={() => handleAlbumSelect(album.id)}
                          disabled={albumSaving}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            photo.album_id === album.id
                              ? "text-purple-300 bg-purple-500/20"
                              : "text-white hover:bg-white/10"
                          }`}
                        >
                          {album.title}
                          {photo.album_id === album.id && (
                            <span className="ml-2 text-purple-400">&#10003;</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleDownload}
          className="w-11 h-11 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="ダウンロード"
          title="ダウンロード"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-white/20 text-white text-2xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="閉じる"
        >
          &times;
        </button>
      </div>

      {/* ナビゲーション矢印 */}
      {currentIndex > 0 && (
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 text-white text-xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="前へ"
        >
          &#8249;
        </button>
      )}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 text-white text-xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="次へ"
        >
          &#8250;
        </button>
      )}

      {/* メディア表示: 画像 or 動画 */}
      {isVideo ? (
        <video
          src={photo.url}
          controls
          autoPlay
          playsInline
          className="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
        />
      ) : (
        <Image
          src={photo.url}
          alt={photo.title || "Photo"}
          width={photo.width || 1200}
          height={photo.height || 900}
          sizes="90vw"
          priority
          className="max-w-[90vw] max-h-[80vh] w-auto h-auto rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)] object-contain"
        />
      )}

      {/* 情報 */}
      <div className="text-white text-center mt-4 max-w-lg">
        <p className="font-bold">{photo.title || "無題"}</p>
        {photo.description && (
          <p className="text-sm text-white/85 mt-1">{photo.description}</p>
        )}
        <p className="text-sm text-white/60 mt-1">
          {new Date(photo.created_at).toLocaleDateString("ja-JP")}
          {" "}
          ({currentIndex + 1} / {photos.length})
        </p>
      </div>

      {/* アルバム操作のトースト通知 */}
      {albumMessage && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/20 backdrop-blur-md text-white text-sm px-5 py-2.5 rounded-full shadow-lg">
          {albumMessage}
        </div>
      )}
    </div>
  );
}
