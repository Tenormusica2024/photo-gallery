import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const codeGetMock = vi.fn();
const rpcMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: codeGetMock,
  }),
}));

describe("invite page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    codeGetMock.mockReturnValue(null);
    getSessionMock.mockResolvedValue({ data: { session: null } });
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it("shows invalid invite when no code is provided", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    expect(
      await screen.findByRole("heading", { name: "無効な招待" })
    ).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("shows invalid invite when lookup returns no family", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));
    codeGetMock.mockReturnValue("bad-code");
    rpcMock.mockResolvedValue({ data: [], error: null });

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    expect(
      await screen.findByRole("heading", { name: "無効な招待" })
    ).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("lookup_family_by_invite", {
      invite: "bad-code",
    });
  });

  it("shows an actionable message when the invite RPC is missing", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));
    codeGetMock.mockReturnValue("bad-code");
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202" },
    });

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    expect(
      await screen.findByText(/招待用 RPC が見つかりません/)
    ).toBeInTheDocument();
  });

  it("shows the join CTA when lookup succeeds", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));
    codeGetMock.mockReturnValue("ok-code");
    rpcMock.mockResolvedValue({
      data: [{ id: "family-1", name: "田中ファミリー" }],
      error: null,
    });

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    expect(
      await screen.findByRole("heading", { name: "田中ファミリーに参加しますか?" })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ファミリーに参加" })).toBeInTheDocument();
    });
  });

  it("redirects to login when joining without a session", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));
    codeGetMock.mockReturnValue("ok-code");
    rpcMock.mockResolvedValueOnce({
      data: [{ id: "family-1", name: "田中ファミリー" }],
      error: null,
    });
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリーに参加" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/login?redirect=%2Finvite%3Fcode%3Dok-code"
      );
    });
  });

  it("shows the joined state after a successful join", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));
    codeGetMock.mockReturnValue("ok-code");
    rpcMock
      .mockResolvedValueOnce({
        data: [{ id: "family-1", name: "田中ファミリー" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: "joined", name: "田中ファミリー" },
        error: null,
      });
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリーに参加" }));

    expect(
      await screen.findByRole("heading", { name: "ようこそ!" })
    ).toBeInTheDocument();
  });

  it("shows the already-member state when the RPC reports an existing membership", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));
    codeGetMock.mockReturnValue("ok-code");
    rpcMock
      .mockResolvedValueOnce({
        data: [{ id: "family-1", name: "田中ファミリー" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: "already_member", name: "田中ファミリー" },
        error: null,
      });
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリーに参加" }));

    expect(
      await screen.findByRole("heading", { name: "すでに参加済みです" })
    ).toBeInTheDocument();
  });

  it("shows an actionable message when the join RPC is missing", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        rpc: rpcMock,
      },
    }));
    codeGetMock.mockReturnValue("ok-code");
    rpcMock
      .mockResolvedValueOnce({
        data: [{ id: "family-1", name: "田中ファミリー" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202" },
      });
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });

    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリーに参加" }));

    expect(
      await screen.findByText(/招待用 RPC が見つかりません/)
    ).toBeInTheDocument();
  });
});
