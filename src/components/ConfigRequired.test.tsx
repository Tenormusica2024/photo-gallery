import { render, screen } from "@testing-library/react";
import ConfigRequired from "./ConfigRequired";

describe("ConfigRequired", () => {
  it("renders the provided title and message", () => {
    render(
      <ConfigRequired
        title="ログインはまだ利用できません"
        message="Supabase の環境変数が未設定です。"
      />
    );

    expect(
      screen.getByRole("heading", { name: "ログインはまだ利用できません" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Supabase の環境変数が未設定です。")
    ).toBeInTheDocument();
  });
});
