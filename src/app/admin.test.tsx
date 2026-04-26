import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const routerMock = {
  push: pushMock,
  refresh: refreshMock,
};
const getSessionMock = vi.fn();
const fromMock = vi.fn();
const rpcMock = vi.fn();
const clipboardWriteTextMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("next/image", () => ({
  default: ({
    unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    void unoptimized,
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" {...props} />
  ),
}));

function createMembershipQuery(result: unknown) {
  return {
    eq: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createMemberListQuery(result: unknown) {
  return {
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe("admin page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();

    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });

    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: clipboardWriteTextMock,
      },
      configurable: true,
    });
  });

  it("renders overview stats and family members for an admin user", async () => {
    const membersData = [
      {
        id: "member-1",
        user_id: "user-1",
        family_id: "family-1",
        role: "admin",
        profiles: {
          display_name: "Hanako",
          email: "hanako@example.com",
        },
      },
      {
        id: "member-2",
        user_id: "user-2",
        family_id: "family-1",
        role: "member",
        profiles: {
          display_name: "Taro",
          email: "taro@example.com",
        },
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({
                data: [
                  { media_type: "image", file_size: 1024 },
                  { media_type: "video", file_size: 2048 },
                ],
                error: null,
              });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "photo-1",
                      title: "公園",
                      media_type: "image",
                      url: "https://example.com/photo.jpg",
                      uploaded_at: "2025-01-02T03:04:05.000Z",
                      file_size: 1024,
                      visibility: "family",
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: {
                  id: "member-1",
                  user_id: "user-1",
                  role: "admin",
                  family_groups: {
                    id: "family-1",
                    name: "田中ファミリー",
                    invite_code: "INVITE123",
                  },
                },
                error: null,
              });
            }

            return createMemberListQuery({
              data: membersData,
              error: null,
            });
          }),
        };
      }

      if (table === "storage_usage") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { user_id: "user-1", total_bytes: 1024 },
                { user_id: "user-2", total_bytes: 2048 },
              ],
              error: null,
            }),
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    expect(await screen.findByText("設定")).toBeInTheDocument();
    expect(screen.getByText("写真")).toBeInTheDocument();
    expect(screen.getByText("動画")).toBeInTheDocument();
    expect(screen.getAllByText("3 KB")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "ファミリー" }));
    expect(await screen.findByText("田中ファミリー")).toBeInTheDocument();
    expect(await screen.findByText("INVITE123")).toBeInTheDocument();
    expect(screen.getByText("Hanako")).toBeInTheDocument();
    expect(screen.getByText("Taro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
  });

  it("creates a family through the RPC flow when no family exists", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: null,
                error: null,
              });
            }

            return createMemberListQuery({
              data: [],
              error: null,
            });
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    rpcMock.mockResolvedValue({
      data: {
        status: "success",
        id: "family-2",
        name: "佐藤ファミリー",
        invite_code: "NEWCODE",
      },
      error: null,
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリー" }));
    const input = await screen.findByPlaceholderText("ファミリー名（例：田中ファミリー）");
    fireEvent.change(input, { target: { value: "佐藤ファミリー" } });
    fireEvent.click(screen.getByRole("button", { name: "ファミリーグループを作成" }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("create_family_with_admin", {
        family_name: "佐藤ファミリー",
      });
      expect(refreshMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("NEWCODE")).toBeInTheDocument();
  });

  it("shows an actionable message when the family-create RPC is missing", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: null,
                error: null,
              });
            }

            return createMemberListQuery({
              data: [],
              error: null,
            });
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202" },
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリー" }));
    fireEvent.change(
      await screen.findByPlaceholderText("ファミリー名（例：田中ファミリー）"),
      { target: { value: "佐藤ファミリー" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "ファミリーグループを作成" }));

    expect(
      await screen.findByText(/ファミリー作成 RPC が見つかりません/)
    ).toBeInTheDocument();
  });

  it("removes a family member after a successful RPC call", async () => {
    const membersData = [
      {
        id: "member-1",
        user_id: "user-1",
        family_id: "family-1",
        role: "admin",
        profiles: {
          display_name: "Hanako",
          email: "hanako@example.com",
        },
      },
      {
        id: "member-2",
        user_id: "user-2",
        family_id: "family-1",
        role: "member",
        profiles: {
          display_name: "Taro",
          email: "taro@example.com",
        },
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: {
                  id: "member-1",
                  user_id: "user-1",
                  role: "admin",
                  family_groups: {
                    id: "family-1",
                    name: "田中ファミリー",
                    invite_code: "INVITE123",
                  },
                },
                error: null,
              });
            }

            return createMemberListQuery({
              data: membersData,
              error: null,
            });
          }),
        };
      }

      if (table === "storage_usage") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    rpcMock.mockResolvedValue({
      data: { status: "success" },
      error: null,
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリー" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("remove_family_member", {
        member_id: "member-2",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Taro")).not.toBeInTheDocument();
    });
  });

  it("copies the invite link for an admin family", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: {
                  id: "member-1",
                  user_id: "user-1",
                  role: "admin",
                  family_groups: {
                    id: "family-1",
                    name: "田中ファミリー",
                    invite_code: "INVITE123",
                  },
                },
                error: null,
              });
            }

            return createMemberListQuery({
              data: [
                {
                  id: "member-1",
                  user_id: "user-1",
                  family_id: "family-1",
                  role: "admin",
                  profiles: {
                    display_name: "Hanako",
                    email: "hanako@example.com",
                  },
                },
              ],
              error: null,
            });
          }),
        };
      }

      if (table === "storage_usage") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    clipboardWriteTextMock.mockResolvedValue(undefined);

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリー" }));
    fireEvent.click(await screen.findByRole("button", { name: "リンクをコピー" }));

    expect(clipboardWriteTextMock).toHaveBeenCalledWith("http://localhost:3000/invite?code=INVITE123");
    expect(await screen.findByRole("button", { name: "コピー済み" })).toBeInTheDocument();
  });

  it("shows an inline error when invite link copy fails", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: {
                  id: "member-1",
                  user_id: "user-1",
                  role: "admin",
                  family_groups: {
                    id: "family-1",
                    name: "田中ファミリー",
                    invite_code: "INVITE123",
                  },
                },
                error: null,
              });
            }

            return createMemberListQuery({
              data: [
                {
                  id: "member-1",
                  user_id: "user-1",
                  family_id: "family-1",
                  role: "admin",
                  profiles: {
                    display_name: "Hanako",
                    email: "hanako@example.com",
                  },
                },
              ],
              error: null,
            });
          }),
        };
      }

      if (table === "storage_usage") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    clipboardWriteTextMock.mockRejectedValue(new Error("denied"));

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリー" }));
    fireEvent.click(await screen.findByRole("button", { name: "リンクをコピー" }));

    expect(
      await screen.findByText("招待リンクをコピーできませんでした。")
    ).toBeInTheDocument();
  });

  it("shows masked error logs for admins when an action fails", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: {
                  id: "member-1",
                  user_id: "user-1",
                  role: "admin",
                  family_groups: {
                    id: "family-1",
                    name: "田中ファミリー",
                    invite_code: "INVITE123",
                  },
                },
                error: null,
              });
            }

            return createMemberListQuery({
              data: [
                {
                  id: "member-1",
                  user_id: "user-1",
                  family_id: "family-1",
                  role: "admin",
                  profiles: {
                    display_name: "Hanako",
                    email: "hanako@example.com",
                  },
                },
                {
                  id: "member-2",
                  user_id: "user-2",
                  family_id: "family-1",
                  role: "member",
                  profiles: {
                    display_name: "Taro",
                    email: "taro@example.com",
                  },
                },
              ],
              error: null,
            });
          }),
        };
      }

      if (table === "storage_usage") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    rpcMock.mockResolvedValue({
      data: { status: "error", code: "Bearer secret-token test@example.com key=abc eyJabcdefghijklmnop" },
      error: null,
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリー" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    const errorTab = await screen.findByRole("button", { name: "エラー (1)" });
    fireEvent.click(errorTab);

    expect(await screen.findByText("エラーログ（このセッション内）")).toBeInTheDocument();
    expect(screen.getByText(/Bearer \[MASKED\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[EMAIL\]/)).toBeInTheDocument();
    expect(screen.getByText(/key=\[MASKED\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[TOKEN\]/)).toBeInTheDocument();
  });

  it("shows an actionable message when the remove-member RPC is missing", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: {
                  id: "member-1",
                  user_id: "user-1",
                  role: "admin",
                  family_groups: {
                    id: "family-1",
                    name: "田中ファミリー",
                    invite_code: "INVITE123",
                  },
                },
                error: null,
              });
            }

            return createMemberListQuery({
              data: [
                {
                  id: "member-1",
                  user_id: "user-1",
                  family_id: "family-1",
                  role: "admin",
                  profiles: {
                    display_name: "Hanako",
                    email: "hanako@example.com",
                  },
                },
                {
                  id: "member-2",
                  user_id: "user-2",
                  family_id: "family-1",
                  role: "member",
                  profiles: {
                    display_name: "Taro",
                    email: "taro@example.com",
                  },
                },
              ],
              error: null,
            });
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202" },
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "ファミリー" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(
      await screen.findByText(/メンバー削除 RPC が見つかりません/)
    ).toBeInTheDocument();
  });

  it("hides admin-only controls for non-admin members", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "photos") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "media_type, file_size") {
              return Promise.resolve({ data: [], error: null });
            }

            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "family_members") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "*, family_groups(*)") {
              return createMembershipQuery({
                data: {
                  id: "member-1",
                  user_id: "user-1",
                  role: "member",
                  family_groups: {
                    id: "family-1",
                    name: "田中ファミリー",
                    invite_code: "INVITE123",
                  },
                },
                error: null,
              });
            }

            return createMemberListQuery({
              data: [
                {
                  id: "member-1",
                  user_id: "user-1",
                  family_id: "family-1",
                  role: "member",
                  profiles: {
                    display_name: "Hanako",
                    email: "hanako@example.com",
                  },
                },
                {
                  id: "member-2",
                  user_id: "user-2",
                  family_id: "family-1",
                  role: "member",
                  profiles: {
                    display_name: "Taro",
                    email: "taro@example.com",
                  },
                },
              ],
              error: null,
            });
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
        rpc: rpcMock,
      },
    }));

    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    expect(await screen.findByText("設定")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^エラー/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ファミリー" }));
    expect(await screen.findByText("田中ファミリー")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "リンクをコピー" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "削除" })).not.toBeInTheDocument();
  });
});
