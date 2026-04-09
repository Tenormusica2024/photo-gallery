import { describe, expect, it } from "vitest";

import { getMissingRpcMessage, isMissingRpcError } from "./supabase-errors";

describe("supabase error helpers", () => {
  it("detects missing RPC errors", () => {
    expect(isMissingRpcError({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpcError({ code: "42501" })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });

  it("returns feature-specific guidance", () => {
    expect(getMissingRpcMessage("family_create")).toContain("ファミリー作成 RPC");
    expect(getMissingRpcMessage("family_invite")).toContain("招待用 RPC");
    expect(getMissingRpcMessage("family_remove")).toContain("メンバー削除 RPC");
  });
});
