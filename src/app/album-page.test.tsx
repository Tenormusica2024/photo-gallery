import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const getSessionMock = vi.fn();
const fromMock = vi.fn();
const masonryGridMock = vi.fn(({ photos }: { photos: Array<{ id: string }> }) => (
  <div data-testid="masonry-grid">items:{photos.length}</div>
));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useParams: () => ({
    id: "album-1",
  }),
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

vi.mock("@/components/MasonryGrid", () => ({
  default: masonryGridMock,
}));

function createQueryBuilder(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
}

describe("album page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });
  });

  it("shows not found when the album does not exist", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "albums") {
        return createQueryBuilder({ data: null, error: null });
      }
      if (table === "photos") {
        return createQueryBuilder({ data: [], error: null });
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

    const { default: AlbumPage } = await import("./album/[id]/page");
    render(<AlbumPage />);

    expect(await screen.findByText("アルバムが見つかりません")).toBeInTheDocument();
  });

  it("shows the empty state when the album has no photos", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "albums") {
        return createQueryBuilder({
          data: {
            id: "album-1",
            title: "春の思い出",
            description: "お花見",
          },
          error: null,
        });
      }
      if (table === "photos") {
        return createQueryBuilder({ data: [], error: null });
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

    const { default: AlbumPage } = await import("./album/[id]/page");
    render(<AlbumPage />);

    expect(await screen.findByText("春の思い出")).toBeInTheDocument();
    expect(screen.getByText("このアルバムにはまだ写真がありません")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "写真をアップロード" })).toHaveAttribute("href", "/upload");
  });

  it("renders the gallery when the album has photos", async () => {
    const photos = [
      {
        id: "photo-1",
        media_type: "image",
        url: "https://example.com/a.jpg",
        title: "one",
        created_at: "2025-01-01",
      },
      {
        id: "photo-2",
        media_type: "image",
        url: "https://example.com/b.jpg",
        title: "two",
        created_at: "2025-01-02",
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "albums") {
        return createQueryBuilder({
          data: {
            id: "album-1",
            title: "春の思い出",
            description: null,
          },
          error: null,
        });
      }
      if (table === "photos") {
        return createQueryBuilder({ data: photos, error: null });
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

    const { default: AlbumPage } = await import("./album/[id]/page");
    render(<AlbumPage />);

    expect(await screen.findByTestId("masonry-grid")).toHaveTextContent("items:2");
    expect(masonryGridMock).toHaveBeenCalled();
  });
});
