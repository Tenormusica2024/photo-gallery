import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Server-side Supabase client for use in Server Components and Route Handlers
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          cookie: cookieStore.toString(),
        },
      },
    }
  );
}
