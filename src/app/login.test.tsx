import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const searchParamGetMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: searchParamGetMock,
  }),
}));

describe("login page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    searchParamGetMock.mockReturnValue(null);
    signInWithPasswordMock.mockResolvedValue({ error: null });
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });
  });

  it("redirects to a safe relative path after login", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          signInWithPassword: signInWithPasswordMock,
          signUp: signUpMock,
        },
      },
    }));
    searchParamGetMock.mockReturnValue("/upload");

    const { default: LoginPage } = await import("./login/page");
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("example@email.com"), {
      target: { value: "family@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("パスワードを入力"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "family@example.com",
        password: "secret123",
      });
      expect(pushMock).toHaveBeenCalledWith("/upload");
    });
  });

  it("rejects open redirects and falls back to /", async () => {
    vi.doMock("@/lib/supabase", () => ({
      isConfigured: true,
      supabase: {
        auth: {
          signInWithPassword: signInWithPasswordMock,
          signUp: signUpMock,
        },
      },
    }));
    searchParamGetMock.mockReturnValue("//evil.example");

    const { default: LoginPage } = await import("./login/page");
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("example@email.com"), {
      target: { value: "family@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("パスワードを入力"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });
});
