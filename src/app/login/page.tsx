"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
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
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for a confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-br from-pink-50 via-lavender-50 to-pink-50 px-4">
      <div className="bg-white rounded-3xl p-10 shadow-[0_8px_30px_rgba(216,27,96,0.15)] max-w-md w-full text-center">
        <h2 className="font-quicksand text-2xl font-bold text-pink-600 mb-1">
          {isSignUp ? "Create Account" : "Welcome Back"}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {isSignUp
            ? "Join to share your family moments"
            : "Sign in to your family gallery"}
        </p>

        <form onSubmit={handleSubmit} className="text-left space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 border-[1.5px] border-pink-100 rounded-2xl text-sm outline-none focus:border-pink-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
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
            {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400">
          {isSignUp ? "Already have an account?" : "New here?"}{" "}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
              setMessage("");
            }}
            className="text-pink-400 font-semibold hover:underline"
          >
            {isSignUp ? "Sign In" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}
