"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { FamilyGroup, FamilyMember, StorageUsage } from "@/types/database";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      // Check family membership
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

        // Load members
        const { data: membersData } = await supabase
          .from("family_members")
          .select("*, profiles(*)")
          .eq("family_id", fg.id)
          .order("joined_at");
        if (membersData) setMembers(membersData as FamilyMember[]);

        // Load storage usage for all family members
        if (membership.role === "admin") {
          const memberIds = (membersData || []).map((m: FamilyMember) => m.user_id);
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

      setLoading(false);
    }
    load();
  }, [router]);

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newFamilyName.trim()) return;

    const { data: fg, error } = await supabase
      .from("family_groups")
      .insert({ name: newFamilyName.trim(), created_by: userId })
      .select()
      .single();

    if (error || !fg) return;

    // Add self as admin
    await supabase.from("family_members").insert({
      family_id: fg.id,
      user_id: userId,
      role: "admin",
    });

    setFamily(fg);
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

  // No family yet - create one
  if (!family) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-b from-pink-50 to-white px-4">
        <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgba(216,27,96,0.15)] max-w-md w-full text-center">
          <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-2">
            ファミリーを作成
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            家族グループを作って、大切な人と写真を共有しましょう
          </p>
          <form onSubmit={createFamily} className="space-y-4">
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
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[var(--color-background)] px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="font-quicksand text-2xl font-bold text-pink-600 text-center">
          管理ダッシュボード
        </h1>

        {/* Family Info */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
          <h2 className="font-semibold text-lg text-gray-700 mb-4">
            {family.name}
          </h2>
          <div className="flex flex-wrap gap-4 items-center">
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
            <div>
              <p className="text-xs text-gray-400 mb-1">メンバー</p>
              <p className="text-lg font-bold text-pink-600">{members.length}</p>
            </div>
          </div>
        </div>

        {/* Storage Usage (Admin Only) */}
        {isAdmin && (
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
            <h2 className="font-semibold text-lg text-gray-700 mb-4">
              ストレージ使用量
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-pink-50 rounded-xl">
                <div className="text-2xl font-bold text-pink-600">
                  {formatBytes(totalStorage)}
                </div>
                <div className="text-xs text-gray-400 mt-1">合計使用量</div>
              </div>
              <div className="text-center p-4 bg-lavender-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-400">
                  {storageData.reduce((s, r) => s + r.photo_count, 0)}
                </div>
                <div className="text-xs text-gray-400 mt-1">写真</div>
              </div>
              <div className="text-center p-4 bg-pink-50 rounded-xl">
                <div className="text-2xl font-bold text-pink-600">
                  {storageData.reduce((s, r) => s + r.video_count, 0)}
                </div>
                <div className="text-xs text-gray-400 mt-1">動画</div>
              </div>
            </div>

            {/* Per-member usage */}
            <h3 className="text-sm font-semibold text-gray-600 mb-2">メンバー別</h3>
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
                    <span className="text-xs text-gray-400 w-16 text-right">
                      {formatBytes(su.total_bytes)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Members */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(216,27,96,0.08)]">
          <h2 className="font-semibold text-lg text-gray-700 mb-4">メンバー</h2>
          <div className="space-y-3">
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
      </div>
    </div>
  );
}
