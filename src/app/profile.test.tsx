import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const uploadToCloudinaryMock = vi.fn();
const getSessionMock = vi.fn();
const fromMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
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

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: uploadToCloudinaryMock,
}));

function createQueryBuilder(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  };
}

describe("profile page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return createQueryBuilder({
          data: {
            id: "user-1",
            email: "family@example.com",
            display_name: "Hanako",
            avatar_url: null,
            role: "user",
            created_at: "2025-01-01",
          },
          error: null,
        });
      }

      if (table === "albums") {
        return createQueryBuilder({
          data: [
            {
              id: "album-1",
              title: "春の思い出",
              photos: [{ count: 2 }],
            },
          ],
          error: null,
        });
      }

      if (table === "photos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 5 }),
        };
      }

      return createQueryBuilder({ data: null, error: null });
    });
  });

  it("renders the authenticated profile and album stats", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
      },
    }));

    const { default: ProfilePage } = await import("./profile/page");
    render(<ProfilePage />);

    expect(await screen.findByText("Hanako")).toBeInTheDocument();
    expect(screen.getByText("family@example.com")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("春の思い出")).toBeInTheDocument();
    expect(screen.getByText("2 枚")).toBeInTheDocument();
  });

  it("saves a renamed display name", async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
    const selectSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "user-1",
        email: "family@example.com",
        display_name: "Hanako",
        avatar_url: null,
        role: "user",
        created_at: "2025-01-01",
      },
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: selectSingleMock,
            }),
          }),
          update: updateMock,
        };
      }

      if (table === "albums") {
        return createQueryBuilder({ data: [], error: null });
      }

      if (table === "photos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        };
      }

      return createQueryBuilder({ data: null, error: null });
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
      },
    }));

    const { default: ProfilePage } = await import("./profile/page");
    render(<ProfilePage />);

    fireEvent.click(await screen.findByRole("button", { name: "名前を編集" }));
    const nameInput = await screen.findByRole("textbox");
    fireEvent.change(nameInput, {
      target: { value: "Sakura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ display_name: "Sakura" });
      expect(updateEqMock).toHaveBeenCalledWith("id", "user-1");
    });
  });

  it("shows an inline error when avatar validation fails", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
      },
    }));

    const { default: ProfilePage } = await import("./profile/page");
    const { container } = render(<ProfilePage />);

    await screen.findByText("Hanako");
    const input = container.querySelector('input[type="file"]');
    const invalidFile = new File(["bad"], "avatar.bmp", { type: "image/bmp" });

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [invalidFile] },
    });

    expect(
      await screen.findByText("対応している画像形式: JPG, PNG, WebP, GIF")
    ).toBeInTheDocument();
  });

  it("shows an inline error when album creation fails", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return createQueryBuilder({
          data: {
            id: "user-1",
            email: "family@example.com",
            display_name: "Hanako",
            avatar_url: null,
            role: "user",
            created_at: "2025-01-01",
          },
          error: null,
        });
      }

      if (table === "albums") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "insert failed" },
              }),
            }),
          }),
        };
      }

      if (table === "photos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        };
      }

      return createQueryBuilder({ data: null, error: null });
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: { getSession: getSessionMock },
        from: fromMock,
      },
    }));

    const { default: ProfilePage } = await import("./profile/page");
    render(<ProfilePage />);

    fireEvent.click(await screen.findByRole("button", { name: "+ 新しいアルバム" }));
    fireEvent.change(screen.getByPlaceholderText("アルバム名"), {
      target: { value: "夏休み" },
    });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(
      await screen.findByText("アルバムを作成できませんでした。")
    ).toBeInTheDocument();
  });
});
