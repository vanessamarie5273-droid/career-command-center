import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Purple / magenta palette (2026-11-02): brand #5D36FF, accent #A100C2. The names stay navy/gold so existing classes keep working.
        navy: { 950: "#1a0f4d", 900: "#2b17a6", 800: "#4424e6", 700: "#5D36FF", 600: "#714FFF", 500: "#7458FF" },
        gold: { 300: "#f6d0f2", 400: "#D522BF", 500: "#A100C2", 600: "#8a00a8" },
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
