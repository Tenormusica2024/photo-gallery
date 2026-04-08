"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { Photo, FamilyGroup, FamilyMember, StorageUsage } from "@/types/database";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

// エラーログをメモリに保持（セッション内のみ、コンポーネント内useEffectで初期化）
const errorLogs: { time: string; message: string }[] = [];
let errorPatchInstalled = false;

export default function AdminPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [family, setFamily] = useState<FamilyGroup | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [storageData, setStorageData] = useState<StorageUsage[]>([]);
  const [totalStorage, setTotalStorage] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // 全体統計
  const [photoCount, setPhotoCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [recentUploads, setRecentUploads] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<{ time: string; message: string }[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "family" | "errors">("overview");
  const setErrorsRef = useRef(setErrors);

  setErrorsRef.current = setErrors;

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { router.push("/login?redirect=/admin"); return; }
        const user = session.user;
        setUserId(user.id);

        // 統計用: カウントとサイズ集計（SELECT * 不要）
        const [countResult, recentResult] = await Promise.all([
          supabase
            .from("photos")
            .select("media_type, file_size"),
          supabase
            .from("photos")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

        if (countResult.data) {
          const photos = countResult.data;
          setPhotoCount(photos.filter((p) => p.media_type === "image").length);
          setVideoCount(photos.filter((p) => p.media_type === "video").length);
          setTotalSize(photos.reduce((sum, p) => sum + (p.file_size || 0), 0));
        }
        if (recentResult.data) {
          setRecentUploads(recentResult.data);
        }

        // ファミリーメンバーシップ確認
        const { data: membership } = await supabase
          .from("family_members")
          .select("*, family_groups(*)")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (membership) {
          const fg = membership.family_groups as unknown as FamilyGroup;
          setFamily(fg);
          setIsAdmin(membership.role === "admin");

          const { data: membersData } = await supabase
            .from("family_members")
            .select("*, profiles(*)")
            .eq("family_id", fg.id)
            .order("joined_at");
          if (membersData) setMembers(membersData as FamilyMember[]);

          if (membership.role === "admin") {
            const memberIds = (membersData || []).map((m: FamilyMember) => m.user_id);
            if (memberIds.length > 0) {
              const { data: storageRows } = await supabase
                .from("storage_usage")
                .select("*")
                .in("user_id", memberIds);
              if (storageRows) {
                setStorageData(storageRows);
                setTotalStorage(storageRows.reduce((sum: number, r: StorageUsage) => sum + r.total_bytes, 0));
              }
            }
          }
        }
      } catch (err) {
        console.error("Admin page load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // エラーログ: console.errorパッチをコンポーネント内で管理（グローバル汚染を防止）
  useEffect(() => {
    const origError = console.error;
    if (!errorPatchInstalled) {
      // 機密情報をマスクしてからログに保存
      const maskSensitive = (text: string): string =>
        text
          .replace(/eyJ[A-Za-z0-9_-]{10,}/g, "[TOKEN]")
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
          .replace(/Bearer\s+\S+/gi, "Bearer [MASKED]")
          .replace(/key[=:]\s*\S+/gi, "key=[MASKED]");
      console.error = (...args: unknown[]) => {
        const raw = args.map((a) => {
          if (typeof a !== "object" || a === null) return String(a);
          try { return JSON.stringify(a); } catch { return String(a); }
        }).join(" ");
        errorLogs.push({
          time: new Date().toLocaleTimeString("ja-JP"),
          message: maskSensitive(raw),
        });
        if (errorLogs.length > 50) errorLogs.shift();
        setErrorsRef.current([...errorLogs].reverse());
        origError.apply(console, args);
      };
      errorPatchInstalled = true;
    }

    setErrors([...errorLogs].reverse());

    return () => {
      console.error = origError;
      errorPatchInstalled = false;
    };
  }, []);

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newFamilyName.trim()) return;

    // RPC経由でファミリー作成+admin追加を1トランザクションで実行
    // （family_members INSERTはRLSで直接禁止されているためRPC必須）
    const { data: result, error } = await supabase
      .rpc("create_family_with_admin", { family_name: newFamilyName.trim() });

    if (error || !result || result.status === "error") {
      console.error("Family creation failed:", error || result?.code);
      return;
    }

    setFamily({ id: result.id, name: result.name, invite_code: result.invite_code, created_by: userId, created_at: new Date().toISOString() });
    setIsAdmin(true);
    setNewFamilyName("");
    router.refresh();
  }

  async function removeMember(memberId: string) {
    if (!isAdmin) return;
    await supabase.from("family_members").delete().eq("id", memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  function copyInviteLink() {
    if (!family) return;
    const url = `${window.location.origin}/invite?code=${family.invite_code}`;
    navigator.clipboard.writeText(url);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  const tabs = [
    { id: "overview" as const, label: "概要" },
    { id: "family" as const, label: "ファミリー" },
    { id: "errors" as const, label: `エラー${errors.length > 0 ? ` (${errors.length})` : ""}` },
  ];

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-pink-50 to-white px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="font-quicksand text-2xl font-bold text-pink-600 text-center">
          設定
        </h1>

        {/* Tab navigation */}
        <div className="flex gap-2 justify-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border-[1.5px] transition-all ${
                activeTab === tab.id
                  ? "bg-pink-100 border-pink-200 text-pink-600"
                  : "bg-white border-pink-100 text-gray-500 hover:bg-pink-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ======== Overview Tab ======== */}
        {activeTab === "overview" && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="写真" value={String(photoCount)} color="pink" />
              <StatCard label="動画" value={String(videoCount)} color="purple" />
              <StatCard label="合計サイズ" value={formatBytes(totalSize)} color="pink" />
              <StatCard label="メンバー" value={String(members.length || 1)} color="purple" />
            </div>

            {/* Cloudinary info */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
              <h2 className="font-semibold text-sm text-gray-700 mb-3">ストレージ情報</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">プロバイダ</span>
                  <p className="font-semibold text-gray-700">Cloudinary</p>
                </div>
                <div>
                  <span className="text-gray-400">プラン</span>
                  <p className="font-semibold text-gray-700">Free (25GB)</p>
                </div>
                <div>
                  <span className="text-gray-400">使用済み</span>
                  <p className="font-semibold text-pink-600">{formatBytes(totalSize)}</p>
                </div>
                <div>
                  <span className="text-gray-400">残り容量</span>
                  <p className="font-semibold text-green-600">
                    {formatBytes(Math.max(0, 25 * 1024 * 1024 * 1024 - totalSize))}
                  </p>
                </div>
              </div>
              {/* Usage bar */}
              <div className="mt-3">
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-pink-400 to-purple-400 h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.max((totalSize / (25 * 1024 * 1024 * 1024)) * 100, 0.5)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {((totalSize / (25 * 1024 * 1024 * 1024)) * 100).toFixed(2)}% 使用中
                </p>
              </div>
            </div>

            {/* Recent uploads */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
              <h2 className="font-semibold text-sm text-gray-700 mb-3">最近のアップロード</h2>
              {recentUploads.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">アップロードはまだありません</p>
              ) : (
                <div className="space-y-2">
                  {recentUploads.map((photo) => (
                    <div key={photo.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {photo.media_type === "video" ? (
                          <div className="w-full h-full bg-purple-100 flex items-center justify-center text-purple-400 text-xs font-bold">
                            VID
                          </div>
                        ) : (
                          <Image
                            src={photo.url}
                            alt={photo.title || ""}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {photo.title || "無題"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {timeAgo(photo.uploaded_at)} / {formatBytes(photo.file_size || 0)}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        photo.visibility === "admin_only"
                          ? "bg-purple-50 text-purple-400"
                          : "bg-green-50 text-green-500"
                      }`}>
                        {photo.visibility === "admin_only" ? "管理者" : "全員"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Storage per member (admin only) */}
            {isAdmin && storageData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
                <h2 className="font-semibold text-sm text-gray-700 mb-3">メンバー別使用量</h2>
                <div className="space-y-2">
                  {storageData.map((su) => {
                    const member = members.find((m) => m.user_id === su.user_id);
                    const name = (member?.profiles as unknown as { display_name: string })?.display_name || "不明";
                    const pct = totalStorage > 0 ? (su.total_bytes / totalStorage) * 100 : 0;
                    return (
                      <div key={su.user_id} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-28 truncate">{name}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-pink-400 to-purple-400 h-2 rounded-full"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-20 text-right">
                          {formatBytes(su.total_bytes)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ======== Family Tab ======== */}
        {activeTab === "family" && (
          <>
            {!family ? (
              <div className="bg-white rounded-2xl p-8 shadow-[0_4px_20px_rgba(216,27,96,0.08)] text-center">
                <h2 className="font-quicksand text-xl font-bold text-pink-600 mb-2">
                  ファミリーを作成
                </h2>
                <p className="text-gray-500 text-sm mb-6">
                  家族グループを作って、大切な人と写真を共有しましょう
                </p>
                <form onSubmit={createFamily} className="space-y-4 max-w-sm mx-auto">
                  <input
                    type="text"
                    value={newFamilyName}
                    onChange={(e) => setNewFamilyName(e.target.value)}
                    placeholder="ファミリー名（例：田中ファミリー）"
                    required
                    className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400"
                  />
                  <button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity"
                  >
                    ファミリーグループを作成
                  </button>
                </form>
              </div>
            ) : (
              <>
                {/* Family info */}
                <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
                  <h2 className="font-semibold text-lg text-gray-700 mb-4">{family.name}</h2>
                  <div className="flex flex-wrap gap-4 items-center">
                    {isAdmin && (
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-xs text-gray-400 mb-1">招待コード</p>
                      <div className="flex gap-2 items-center">
                        <code className="bg-pink-50 px-3 py-1.5 rounded-lg text-sm text-pink-600 font-mono">
                          {family.invite_code}
                        </code>
                        <button
                          onClick={copyInviteLink}
                          className="text-xs text-pink-500 hover:text-pink-600 font-semibold"
                        >
                          {inviteCopied ? "コピー済み" : "リンクをコピー"}
                        </button>
                      </div>
                    </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-400 mb-1">メンバー</p>
                      <p className="text-lg font-bold text-pink-600">{members.length}</p>
                    </div>
                  </div>
                </div>

                {/* Members list */}
                <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
                  <h2 className="font-semibold text-sm text-gray-700 mb-3">メンバー</h2>
                  <div className="space-y-2">
                    {members.map((m) => {
                      const p = m.profiles as unknown as { display_name: string; email: string } | undefined;
                      return (
                        <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center text-white font-bold text-sm">
                              {p?.display_name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-700">
                                {p?.display_name || "不明"}
                              </p>
                              <p className="text-xs text-gray-400">{p?.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              m.role === "admin"
                                ? "bg-pink-100 text-pink-600"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {m.role}
                            </span>
                            {isAdmin && m.user_id !== userId && (
                              <button
                                onClick={() => removeMember(m.id)}
                                className="text-xs text-red-400 hover:text-red-500"
                              >
                                削除
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ======== Errors Tab ======== */}
        {activeTab === "errors" && (
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
            <h2 className="font-semibold text-sm text-gray-700 mb-3">
              エラーログ（このセッション内）
            </h2>
            {errors.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">&#10003;</div>
                <p className="text-sm text-green-600 font-semibold">エラーなし</p>
                <p className="text-xs text-gray-400 mt-1">
                  このセッション中にエラーは検出されていません
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {errors.map((err, i) => (
                  <div key={i} className="bg-red-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-red-400 font-mono">{err.time}</span>
                    </div>
                    <p className="text-xs text-red-600 font-mono break-all">
                      {err.message.length > 300 ? err.message.substring(0, 300) + "..." : err.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: "pink" | "purple" }) {
  const bg = color === "pink" ? "bg-pink-50" : "bg-purple-50";
  const text = color === "pink" ? "text-pink-600" : "text-purple-500";
  return (
    <div className={`${bg} rounded-2xl p-4 text-center`}>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
