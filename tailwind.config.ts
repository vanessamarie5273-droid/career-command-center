import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Violet / indigo palette (2026-11-02). The names stay navy/gold so existing classes keep working.
        navy: { 950: "#1b1446", 900: "#2a1d7a", 800: "#3a29a8", 700: "#4834cc", 600: "#5b45e0", 500: "#6f5cf2" },
        gold: { 300: "#e4d4ff", 400: "#c08cff", 500: "#a35cf5", 600: "#8b3fe0" },
        ink: { 900: "#0f172a", 700: "#334155", 500: "#64748b", 300: "#cbd5e1", 100: "#f1f5f9" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
