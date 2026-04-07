import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Pastel Album - Family Photo Gallery",
  description: "A beautiful pastel-themed gallery for family photos and precious moments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--color-background)]">
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
