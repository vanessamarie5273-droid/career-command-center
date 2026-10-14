import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Career Command Center", template: "%s · Career Command Center" },
  description: "Private executive career intelligence and opportunity management",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0b1730", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
