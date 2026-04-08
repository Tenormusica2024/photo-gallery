import type { Metadata } from "next";
import { Nunito, Quicksand } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-nunito",
  display: "swap",
});

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-qs",
  display: "swap",
});

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
    <html lang="ja" className={`h-full antialiased ${nunito.variable} ${quicksand.variable}`}>
      <body className="min-h-full flex flex-col bg-[var(--color-background)]">
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
