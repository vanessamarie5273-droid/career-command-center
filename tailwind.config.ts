import type { Config } from "tailwindcss";

/**
 * Design tokens (redesign, Nov 28). One purple/magenta brand: brand #5D36FF, accent #A100C2, signature gradient
 * #5D36FF → #A100C2. `navy` and `gold` are older names for the same colours, kept so existing classes keep working.
 * Spacing follows Tailwind's 4px scale used in 8px steps: page padding 24 (p-6), section gaps 24 (gap-6), component gaps 16 (gap-4).
 */
const brand = { 50: "#f6f4ff", 100: "#efeaff", 200: "#e2d9ff", 300: "#cbbdff", 400: "#9D85FF", 500: "#7458FF", 600: "#5D36FF", 700: "#4a26ef", 800: "#3b1fc4", 900: "#2b17a6", 950: "#1a0f4d" };

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand,
        accent: { 300: "#f6d0f2", 400: "#D522BF", 500: "#A100C2", 600: "#8a00a8" },
        // Text on white: ink (titles), ink-2 (body), ink-3 (details). All pass WCAG AA on white and on brand-50.
        ink: { DEFAULT: "#1a1446", 2: "#45406b", 3: "#5f5b82", line: "#e6e1f7", 900: "#0f172a", 700: "#334155", 500: "#64748b", 300: "#cbd5e1", 100: "#f1f5f9" },
        navy: { 950: "#1a0f4d", 900: "#2b17a6", 800: "#4424e6", 700: "#5D36FF", 600: "#714FFF", 500: "#7458FF" },
        gold: { 300: "#f6d0f2", 400: "#D522BF", 500: "#A100C2", 600: "#8a00a8" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { card: "12px", ctl: "8px" },
    },
  },
  plugins: [],
} satisfies Config;
