type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export function isMissingRpcError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202";
}

export function getMissingRpcMessage(feature: "family_create" | "family_invite" | "family_remove"): string {
  switch (feature) {
    case "family_create":
      return "ファミリー作成 RPC が見つかりません。Supabase migration を反映し、PostgREST schema cache を更新してください。";
    case "family_invite":
      return "招待用 RPC が見つかりません。Supabase migration を反映し、PostgREST schema cache を更新してください。";
    case "family_remove":
      return "メンバー削除 RPC が見つかりません。Supabase migration を反映し、PostgREST schema cache を更新してください。";
  }
}
