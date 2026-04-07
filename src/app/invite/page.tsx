"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { FamilyGroup } from "@/types/database";

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [family, setFamily] = useState<FamilyGroup | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "joined" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code) { setStatus("not_found"); return; }

    async function checkInvite() {
      // Find family by invite code
      const { data, error: fetchError } = await supabase
        .from("family_groups")
        .select("*")
        .eq("invite_code", code)
        .single();

      if (fetchError || !data) {
        setStatus("not_found");
        return;
      }

      setFamily(data);
      setStatus("found");
    }
    checkInvite();
  }, [code]);

  async function joinFamily() {
    if (!family) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/invite?code=${code}`);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", family.id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      setStatus("joined");
      return;
    }

    // Join as member
    const { error: joinError } = await supabase
      .from("family_members")
      .insert({
        family_id: family.id,
        user_id: user.id,
        role: "member",
      });

    if (joinError) {
      setError(joinError.message);
      setStatus("error");
      return;
    }

    setStatus("joined");
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-br from-pink-50 via-lavender-50 to-pink-50 px-4">
      <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgba(216,27,96,0.15)] max-w-md w-full text-center">
        {status === "loading" && (
          <p className="text-gray-400">Looking up invite...</p>
        )}

        {status === "not_found" && (
          <>
            <h2 className="font-quicksand text-xl font-bold text-gray-600 mb-2">
              Invalid Invite
            </h2>
            <p className="text-gray-500 text-sm">
              This invite link is invalid or has expired.
            </p>
          </>
        )}

        {status === "found" && family && (
          <>
            <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-2">
              Join {family.name}?
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              You&apos;ve been invited to join this family&apos;s photo gallery
            </p>
            <button
              onClick={joinFamily}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Join Family
            </button>
          </>
        )}

        {status === "joined" && (
          <>
            <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-2">
              Welcome!
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              You&apos;ve joined {family?.name}. Start sharing photos!
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Go to Gallery
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
    <Suspense fallback={<div className="min-h-[calc(100vh-56px)] flex items-center justify-center"><p className="text-gray-400">Loading...</p></div>}>
      <InviteContent />
    </Suspense>
  );
}
