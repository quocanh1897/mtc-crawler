import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { GenreBar } from "@/components/layout/GenreBar";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Binslib — Thư viện truyện",
  description: "Personal book library & statistics dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased min-h-screen flex flex-col">
        <Header />
        <GenreBar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
