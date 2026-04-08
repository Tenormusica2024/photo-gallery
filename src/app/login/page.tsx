"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // オープンリダイレクト防止: 同一オリジンの相対パスのみ許可
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirectTo = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/";
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // メール確認無効化済み: セッションが返ればそのままログイン
        if (data.session) {
          router.push(redirectTo);
          return;
        }
        setMessage("アカウントを作成しました。ログインしてください。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(redirectTo);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-br from-pink-50 via-lavender-50 to-pink-50 px-4">
      <div className="bg-white rounded-3xl p-10 shadow-[0_8px_30px_rgba(216,27,96,0.15)] max-w-md w-full text-center">
        <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-1">
          {isSignUp ? "アカウント作成" : "おかえりなさい"}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {isSignUp
            ? "家族の思い出を共有しましょう"
            : "家族のギャラリーにログイン"}
        </p>

        <form onSubmit={handleSubmit} className="text-left space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              required
              minLength={6}
              className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          {message && (
            <p className="text-green-500 text-sm text-center">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "..." : isSignUp ? "アカウント作成" : "ログイン"}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400">
          {isSignUp ? "アカウントをお持ちの方は" : "初めての方は"}{" "}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
              setMessage("");
            }}
            className="text-pink-400 font-semibold hover:underline"
          >
            {isSignUp ? "ログイン" : "アカウント作成"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-56px)] flex items-center justify-center"><p className="text-gray-400">読み込み中...</p></div>}>
      <LoginContent />
    </Suspense>
  );
}
