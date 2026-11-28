import "./globals.css";
import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  applicationName: APP_NAME,
  description: "Private executive career intelligence and opportunity management",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#2b17a6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
