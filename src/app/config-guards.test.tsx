import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const getSessionMock = vi.fn().mockResolvedValue({
  data: { session: null },
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
  useParams: () => ({
    id: "album-id",
  }),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
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

vi.mock("@/lib/supabase", () => ({
  isConfigured: false,
  supabase: {
    auth: {
      getSession: getSessionMock,
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe("config-required page guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: null } });
  });

  it("shows the config-required message on the login page", async () => {
    const { default: LoginPage } = await import("./login/page");
    render(<LoginPage />);

    expect(
      await screen.findByRole("heading", { name: "ログインはまだ利用できません" })
    ).toBeInTheDocument();
  });

  it("shows the config-required message on the invite page", async () => {
    const { default: InvitePage } = await import("./invite/page");
    render(<InvitePage />);

    expect(
      await screen.findByRole("heading", { name: "招待リンクはまだ利用できません" })
    ).toBeInTheDocument();
  });

  it("shows the config-required message on the album page", async () => {
    const { default: AlbumPage } = await import("./album/[id]/page");
    render(<AlbumPage />);

    expect(
      await screen.findByRole("heading", { name: "アルバムはまだ利用できません" })
    ).toBeInTheDocument();
  });

  it("shows the config-required message on the upload page", async () => {
    const { default: UploadPage } = await import("./upload/page");
    render(<UploadPage />);

    expect(
      await screen.findByRole("heading", { name: "アップロードはまだ利用できません" })
    ).toBeInTheDocument();
  });

  it("shows the config-required message on the admin page", async () => {
    const { default: AdminPage } = await import("./admin/page");
    render(<AdminPage />);

    expect(
      await screen.findByRole("heading", { name: "設定画面はまだ利用できません" })
    ).toBeInTheDocument();
  });

  it("shows the config-required message on the profile page", async () => {
    const { default: ProfilePage } = await import("./profile/page");
    render(<ProfilePage />);

    expect(
      await screen.findByRole("heading", { name: "プロフィールはまだ利用できません" })
    ).toBeInTheDocument();
  });
});
