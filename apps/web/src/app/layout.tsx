import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import { themeScript } from "@/components/ThemeToggle";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: { default: "NEXORA — Backend Engineering, Beyond Frameworks", template: "%s · NEXORA" },
  description: "Understand the systems, protocols and machinery that make backend frameworks work. Interactive labs, first-principles lessons and a grounded AI tutor.",
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f3f0e8" }, { media: "(prefers-color-scheme: dark)", color: "#0a0b0e" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
