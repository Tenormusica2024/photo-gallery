"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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

      <div className="flex items-center gap-6">
        <Link href="/" className={linkClass("/")}>
          Gallery
        </Link>
        {user && (
          <>
            <Link href="/profile" className={linkClass("/profile")}>
              Albums
            </Link>
            <Link href="/upload" className={linkClass("/upload")}>
              Upload
            </Link>
          </>
        )}

        {user ? (
          <button
            onClick={handleSignOut}
            className="text-sm font-semibold text-gray-500 hover:text-pink-600 transition-colors"
          >
            Sign Out
          </button>
        ) : (
          <Link
            href="/login"
            className="bg-gradient-to-r from-pink-300 to-purple-300 text-white px-5 py-2 rounded-full text-sm font-bold hover:opacity-85 transition-opacity"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
