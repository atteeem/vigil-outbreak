import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TopNav } from "@/components/nav/top-nav";

export const metadata: Metadata = {
  title: { default: "VIGIL OUTBREAK — Global Infectious Disease Intelligence", template: "%s · VIGIL OUTBREAK" },
  description: "Evidence-based monitoring of outbreaks, emerging pathogens and official public-health investigations.",
};

export const viewport: Viewport = { themeColor: "#07080a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
