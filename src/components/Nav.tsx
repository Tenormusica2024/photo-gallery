"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// メニュー項目の単一ソース（デスクトップ・モバイル共通）
const NAV_LINKS = [
  { href: "/", label: "ギャラリー", authRequired: false },
  { href: "/profile", label: "アルバム", authRequired: true },
  { href: "/upload", label: "アップロード", authRequired: true },
  { href: "/admin", label: "設定", authRequired: true },
] as const;

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Supabase未設定時はデモモードのため認証処理をスキップ
    if (!isConfigured) return;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        const { data: membership } = await supabase
          .from("family_members")
          .select("role")
          .eq("user_id", session.user.id)
          .limit(1)
          .single();
        if (membership?.role === "admin") setIsAdmin(true);
      }
    }
    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setIsAdmin(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const linkClass = (href: string) =>
    `text-sm font-semibold transition-colors ${
      pathname === href
        ? "text-pink-600"
        : "text-gray-500 hover:text-pink-600"
    }`;

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 bg-white/85 backdrop-blur-md border-b border-pink-50">
      <Link href="/" className="font-quicksand text-xl font-semibold text-pink-600">
        pastel<span className="text-purple-400">album</span>
      </Link>

      {/* モバイルメニューボタン */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="sm:hidden text-gray-500 hover:text-pink-600"
        aria-label="Menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {menuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* デスクトップメニュー */}
      <div className="hidden sm:flex items-center gap-6">
        {NAV_LINKS.map((link) =>
          link.authRequired && !user ? null : (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          )
        )}
        {user ? (
          <button
            onClick={handleSignOut}
            className="text-sm font-semibold text-gray-500 hover:text-pink-600 transition-colors"
          >
            ログアウト
          </button>
        ) : (
          <Link
            href="/login"
            className="bg-gradient-to-r from-pink-300 to-purple-300 text-white px-5 py-2 rounded-full text-sm font-bold hover:opacity-85 transition-opacity"
          >
            ログイン
          </Link>
        )}
      </div>

      {/* モバイルドロップダウン */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-white/95 backdrop-blur-md border-b border-pink-100 shadow-lg sm:hidden z-50">
          <div className="flex flex-col px-6 py-4 gap-3">
            {NAV_LINKS.map((link) =>
              link.authRequired && !user ? null : (
                <Link key={link.href} href={link.href} className={linkClass(link.href)} onClick={() => setMenuOpen(false)}>
                  {link.label}
                </Link>
              )
            )}
            {user ? (
              <button
                onClick={() => { handleSignOut(); setMenuOpen(false); }}
                className="text-sm font-semibold text-gray-500 hover:text-pink-600 transition-colors text-left"
              >
                ログアウト
              </button>
            ) : (
              <Link
                href="/login"
                className="text-sm font-semibold text-pink-600"
                onClick={() => setMenuOpen(false)}
              >
                ログイン
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
