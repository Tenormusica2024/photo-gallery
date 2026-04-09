import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const getSessionMock = vi.fn();
const uploadToCloudinaryMock = vi.fn();
const deleteFromCloudinaryMock = vi.fn();
const fromMock = vi.fn();
const createObjectURLMock = vi.fn();
const revokeObjectURLMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("next/image", () => ({
  default: ({
    unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    unoptimized?: boolean;
  }) => (
    void unoptimized,
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" {...props} />
  ),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: uploadToCloudinaryMock,
  deleteFromCloudinary: deleteFromCloudinaryMock,
}));

function makeSizedFile(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function createQueryBuilder(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockResolvedValue(result),
  };
}

describe("upload page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;
    createObjectURLMock.mockReturnValue("blob:preview-1");

    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "user-1" },
        },
      },
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "albums") {
        return createQueryBuilder({
          data: [{ id: "album-1", title: "春の思い出" }],
          error: null,
        });
      }

      if (table === "family_members") {
        return createQueryBuilder({
          data: { family_id: "family-1" },
          error: null,
        });
      }

      if (table === "photos") {
        return createQueryBuilder({
          error: null,
        });
      }

      return createQueryBuilder({ data: null, error: null });
    });

    uploadToCloudinaryMock.mockResolvedValue({
      public_id: "photo-1",
      secure_url: "https://res.cloudinary.com/demo/image/upload/photo-1.jpg",
      width: 800,
      height: 600,
    });
    deleteFromCloudinaryMock.mockResolvedValue({
      result: "ok",
    });
  });

  it("redirects unauthenticated users to login", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: null,
      },
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    render(<UploadPage />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login?redirect=/upload");
    });
  });

  it("shows config guard when upload is unavailable", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: false,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    render(<UploadPage />);

    expect(
      screen.getByRole("heading", { name: "アップロードはまだ利用できません" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Supabase と Cloudinary の設定が未完了のため、写真や動画のアップロードは開始できません。"
      )
    ).toBeInTheDocument();
  });

  it("shows an error when an image exceeds 10MB", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    const oversizedImage = makeSizedFile(
      "too-large.jpg",
      "image/jpeg",
      11 * 1024 * 1024
    );

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [oversizedImage] },
    });

    expect(
      await screen.findByText("too-large.jpg のサイズが10MBを超えています")
    ).toBeInTheDocument();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it("shows an error when a video exceeds 100MB", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    const oversizedVideo = makeSizedFile(
      "too-large.mp4",
      "video/mp4",
      101 * 1024 * 1024
    );

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [oversizedVideo] },
    });

    expect(
      await screen.findByText("too-large.mp4 のサイズが100MBを超えています")
    ).toBeInTheDocument();
  });

  it("creates a preview for a valid image selection", async () => {
    createObjectURLMock.mockReturnValue("blob:preview-image");

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validImage = makeSizedFile("family.jpg", "image/jpeg", 1024);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validImage] },
    });

    await waitFor(() => {
      expect(
        container.querySelector('img[src="blob:preview-image"]')
      ).not.toBeNull();
    });
  });

  it("shows an error when the selected album is not owned by the user", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validImage = makeSizedFile("family.jpg", "image/jpeg", 1024);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validImage] },
    });

    const select = await screen.findByDisplayValue("アルバムなし");
    const extraOption = document.createElement("option");
    extraOption.value = "album-not-owned";
    extraOption.text = "他人のアルバム";
    select.appendChild(extraOption);
    fireEvent.change(select, {
      target: { value: "album-not-owned" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "写真 1枚をアップロード" })
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "選択されたアルバムが見つかりません。ページを再読み込みしてください。"
        )
      ).toBeInTheDocument();
    });
    expect(uploadToCloudinaryMock).not.toHaveBeenCalled();
  });

  it("uploads a valid file and redirects to the gallery", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validImage = makeSizedFile("family.jpg", "image/jpeg", 1024);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validImage] },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "写真 1枚をアップロード" })
    );

    await waitFor(() => {
      expect(uploadToCloudinaryMock).toHaveBeenCalledWith(
        validImage,
        "pastelalbum",
        "image"
      );
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });

  it("uploads a valid video with the video resource type", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validVideo = makeSizedFile("family.mp4", "video/mp4", 2048);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validVideo] },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "動画 1本をアップロード" })
    );

    await waitFor(() => {
      expect(uploadToCloudinaryMock).toHaveBeenCalledWith(
        validVideo,
        "pastelalbum",
        "video"
      );
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });

  it("shows the Cloudinary error message when upload fails", async () => {
    uploadToCloudinaryMock.mockRejectedValue(new Error("Cloudinary upload broken"));

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validImage = makeSizedFile("family.jpg", "image/jpeg", 1024);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validImage] },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "写真 1枚をアップロード" })
    );

    await waitFor(() => {
      expect(screen.getByText("Cloudinary upload broken")).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a fallback error message when upload fails without a message", async () => {
    uploadToCloudinaryMock.mockRejectedValue({ reason: "unknown" });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validImage = makeSizedFile("family.jpg", "image/jpeg", 1024);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validImage] },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "写真 1枚をアップロード" })
    );

    await waitFor(() => {
      expect(
        screen.getByText("アップロードに失敗しました")
      ).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows the database error message when photo persistence fails", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "albums") {
        return createQueryBuilder({
          data: [{ id: "album-1", title: "春の思い出" }],
          error: null,
        });
      }

      if (table === "family_members") {
        return createQueryBuilder({
          data: { family_id: "family-1" },
          error: null,
        });
      }

      if (table === "photos") {
        return createQueryBuilder({
          error: { message: "photos insert failed" },
        });
      }

      return createQueryBuilder({ data: null, error: null });
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validImage = makeSizedFile("family.jpg", "image/jpeg", 1024);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validImage] },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "写真 1枚をアップロード" })
    );

    await waitFor(() => {
      expect(screen.getByText("photos insert failed")).toBeInTheDocument();
    });
    expect(deleteFromCloudinaryMock).toHaveBeenCalledWith("photo-1", "image");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("keeps the database error visible even if Cloudinary cleanup fails", async () => {
    deleteFromCloudinaryMock.mockRejectedValue(new Error("cleanup broken"));

    fromMock.mockImplementation((table: string) => {
      if (table === "albums") {
        return createQueryBuilder({
          data: [{ id: "album-1", title: "春の思い出" }],
          error: null,
        });
      }

      if (table === "family_members") {
        return createQueryBuilder({
          data: { family_id: "family-1" },
          error: null,
        });
      }

      if (table === "photos") {
        return createQueryBuilder({
          error: { message: "photos insert failed" },
        });
      }

      return createQueryBuilder({ data: null, error: null });
    });

    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          getSession: getSessionMock,
        },
        from: fromMock,
      },
    }));

    const { default: UploadPage } = await import("./upload/page");
    const { container } = render(<UploadPage />);

    await screen.findByRole("heading", { name: "アップロード" });

    const input = container.querySelector('input[type="file"]');
    const validImage = makeSizedFile("family.jpg", "image/jpeg", 1024);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [validImage] },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "写真 1枚をアップロード" })
    );

    await waitFor(() => {
      expect(screen.getByText("photos insert failed")).toBeInTheDocument();
    });
    expect(deleteFromCloudinaryMock).toHaveBeenCalledWith("photo-1", "image");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
