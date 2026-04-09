"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConfigRequired from "@/components/ConfigRequired";
import { supabase, isConfigured } from "@/lib/supabase";
import { getMissingRpcMessage, isMissingRpcError } from "@/lib/supabase-errors";
// RPC経由で取得するファミリー情報（id, nameのみ）
interface InviteFamily {
  id: string;
  name: string;
}

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [family, setFamily] = useState<InviteFamily | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "joined" | "already_member" | "error">("loading");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) {
      setStatus("not_found");
      return;
    }

    async function checkInvite() {
      // RPC経由で招待コードを照合（family_groupsへの直接SELECTはRLSで制限済み）
      const { data, error: fetchError } = await supabase
        .rpc("lookup_family_by_invite", { invite: code });

      if (isMissingRpcError(fetchError)) {
        setError(getMissingRpcMessage("family_invite"));
        setStatus("error");
        return;
      }

      if (fetchError || !data || data.length === 0) {
        setStatus("not_found");
        return;
      }

      setFamily({ id: data[0].id, name: data[0].name });
      setStatus("found");
    }
    checkInvite();
  }, [code]);

  // RPCエラーコードをユーザー向けメッセージに変換
  const errorMessages: Record<string, string> = {
    auth_required: "ログインが必要です",
    invalid_invite: "招待コードが無効です",
  };

  async function joinFamily() {
    if (!family || joining) return;
    setJoining(true);

    try {
      // getSession()を使用（getUser()はサーバーリクエストが発生するため）
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent(`/invite?code=${code}`)}`);
        return;
      }

      // RPC経由でファミリーに参加（直接INSERTはRLSで禁止済み）
      const { data: result, error: joinError } = await supabase
        .rpc("join_family_by_invite", { invite_code: code });

      if (isMissingRpcError(joinError)) {
        setError(getMissingRpcMessage("family_invite"));
        setStatus("error");
        return;
      }

      if (joinError) {
        setError("参加処理に失敗しました");
        setStatus("error");
        return;
      }

      // 統一された返り値形式: {status: "error", code: "..."} | {status: "joined"|"already_member", ...}
      if (result?.status === "error") {
        setError(errorMessages[result.code] ?? "エラーが発生しました");
        setStatus("error");
        return;
      }

      setStatus(result?.status === "already_member" ? "already_member" : "joined");
    } finally {
      setJoining(false);
    }
  }

  if (!isConfigured) {
    return (
      <ConfigRequired
        title="招待リンクはまだ利用できません"
        message="Supabase の環境変数が未設定のため、招待コードの照合と参加処理を開始できません。"
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-br from-pink-50 via-lavender-50 to-pink-50 px-4">
      <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgba(216,27,96,0.15)] max-w-md w-full text-center">
        {status === "loading" && (
          <p className="text-gray-400">招待を確認中...</p>
        )}

        {status === "not_found" && (
          <>
            <h2 className="font-quicksand text-xl font-bold text-gray-600 mb-2">
              無効な招待
            </h2>
            <p className="text-gray-500 text-sm">
              この招待リンクは無効か、有効期限が切れています。
            </p>
          </>
        )}

        {status === "found" && family && (
          <>
            <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-2">
              {family.name}に参加しますか?
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              このファミリーのフォトギャラリーに招待されています
            </p>
            <button
              onClick={joinFamily}
              disabled={joining}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {joining ? "参加中..." : "ファミリーに参加"}
            </button>
          </>
        )}

        {status === "joined" && (
          <>
            <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-2">
              ようこそ!
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {family?.name}に参加しました。写真を共有しましょう!
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity"
            >
              ギャラリーへ
            </button>
          </>
        )}

        {status === "already_member" && (
          <>
            <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-2">
              すでに参加済みです
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {family?.name}のメンバーです。
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity"
            >
              ギャラリーへ
            </button>
          </>
        )}

        {status === "error" && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-56px)] flex items-center justify-center"><p className="text-gray-400">読み込み中...</p></div>}>
      <InviteContent />
    </Suspense>
  );
}
