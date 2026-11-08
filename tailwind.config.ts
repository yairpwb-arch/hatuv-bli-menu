import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  // On touch devices there's no real mouse, so a tap can trigger :hover and
  // then leave it visually "stuck" (darkened/tinted) until the next tap
  // elsewhere moves it. Scoping every hover: utility to devices that
  // genuinely support hover (`@media (hover: hover)`) fixes this app-wide,
  // instead of having to special-case it on individual buttons.
  future: { hoverOnlyWhenSupported: true },
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Heebo', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
          tint: "hsl(var(--primary-tint))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        surface: {
          raised: "hsl(var(--surface-raised))",
          sunken: "hsl(var(--surface-sunken))",
          locked: "hsl(var(--surface-locked))",
        },
        line: {
          DEFAULT: "hsl(var(--line))",
          strong: "hsl(var(--line-strong))",
        },
        dim: "hsl(var(--fg-dim))",
        faint: "hsl(var(--fg-faint))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          inner: "hsl(var(--card-inner))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        gold: 'hsl(var(--color-gold))',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        // Design-system radii
        card: "24px",
        inner: "16px",
        button: "16px",
        pill: "9999px",
      },
      spacing: {
        // Design-system spacing: gap between cards / padding inside a card
        "card-gap": "16px",
        card: "20px",
      },
      fontSize: {
        // Design-system type scale (Heebo). In rem (30px / 18 / 28 / 56 / 15 /
        // 13 at the default 16px root) so Settings → text size scales them.
        "screen-title": ["1.875rem", { lineHeight: "2.375rem", fontWeight: "800" }],
        "card-title": ["1.125rem", { lineHeight: "1.625rem", fontWeight: "700" }],
        stat: ["1.75rem", { lineHeight: "2.125rem", fontWeight: "800" }],
        "stat-lg": ["3.5rem", { lineHeight: "3.75rem", fontWeight: "800" }],
        body: ["0.9375rem", { lineHeight: "1.375rem", fontWeight: "400" }],
        label: ["0.8125rem", { lineHeight: "1.125rem", fontWeight: "400" }],
      },
      boxShadow: {
        // No glows in the design system — kept as no-ops for existing markup.
        'glow': 'none',
        'glow-lg': 'none',
      },
      keyframes: {
        // A guide page's text coming in: fade + a small rise.
        "story-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // The finished-guide check: drawn in, then a soft settle.
        "check-draw": {
          from: { strokeDashoffset: "1" },
          to: { strokeDashoffset: "0" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "70%": { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Content map — transform/opacity only, so they stay on the compositor.
        "here-ring": {
          "0%": { transform: "scale(1)", opacity: "0.9" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        "spot-ping": {
          "0%": { transform: "scale(0.9)", opacity: "1" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
        "spot-ping-box": {
          "0%, 100%": { transform: "scale(1)" },
          "30%": { transform: "scale(1.03)" },
        },
        "node-reveal": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "lock-open": {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        "trophy-pop": {
          "0%": { transform: "translate(-50%, -50%) scale(0.5)", opacity: "0" },
          "60%": { transform: "translate(-50%, -50%) scale(1.2)", opacity: "1" },
          "100%": { transform: "translate(-50%, -50%) scale(1)", opacity: "1" },
        },
        "water-rise": {
          "0%": { transform: "scaleY(0.05)" },
          "100%": { transform: "scaleY(1)" },
        },
        "fill-pop": {
          "0%": { transform: "scale(0.82)", opacity: "0.35" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.45)" },
          "50%": { boxShadow: "0 0 0 10px hsl(var(--primary) / 0)" },
        },
        "splash-in": {
          "0%": { transform: "translateY(-160%) scale(0.4) rotate(-8deg)", opacity: "0" },
          "70%": { transform: "translateY(0) scale(1.15) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1) rotate(0deg)", opacity: "1" },
        },
        "splash-out": {
          "0%": { transform: "perspective(800px) scale(1) rotateX(0deg)", opacity: "1" },
          "100%": { transform: "perspective(800px) scale(0.2) rotateX(60deg)", opacity: "0" },
        },
        "screen-shake": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(3px, -2px)" },
          "50%": { transform: "translate(-3px, 2px)" },
          "75%": { transform: "translate(2px, 2px)" },
        },
        "boat-rock": {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        "marker-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,255,255,0.55)" },
          "50%": { boxShadow: "0 0 0 8px rgba(255,255,255,0)" },
        },
        "wake-fade": {
          "0%": { opacity: "0.7", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.4)" },
        },
        "part-reveal": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "menu-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "loader-spin": { to: { transform: "rotate(360deg)" } },
        "loader-breathe": { "0%, 100%": { transform: "scale(1)" }, "50%": { transform: "scale(1.04)" } },
        "loader-progress": { from: { width: "0%" }, to: { width: "90%" } },
        shimmer: { to: { transform: "translateX(100%)" } },
        "splash-rise": {
          "0%": { opacity: "0", transform: "translateY(28px) scale(0.92)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "page-enter": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        sparkle: {
          "0%": { transform: "scale(0) translate(0, 0)", opacity: "0" },
          "40%": { opacity: "1" },
          "100%": { transform: "scale(1) translate(var(--sx), var(--sy))", opacity: "0" },
        },
      },
      animation: {
        "story-in": "story-in 250ms ease-out both",
        "check-draw": "check-draw 450ms ease-out 200ms both",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-up": "slide-up 0.5s ease-out forwards",
        "scale-in": "scale-in 0.3s ease-out forwards",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "bounce-in": "bounce-in 0.4s ease-out forwards",
        "pulse-glow": "pulse-glow 2s ease-out infinite",
        "fill-pop": "fill-pop 0.2s ease-out",
        "water-rise": "water-rise 0.3s ease-out",
        "here-ring": "here-ring 2s ease-out infinite",
        "spot-ping": "spot-ping 0.65s ease-out 2",
        "spot-ping-box": "spot-ping-box 0.6s ease-out 2",
        "node-reveal": "node-reveal 0.4s ease-out 0.15s both",
        "lock-open": "lock-open 0.4s ease-out forwards",
        "trophy-pop": "trophy-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "splash-in": "splash-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "splash-out": "splash-out 0.6s ease-in forwards",
        "screen-shake": "screen-shake 0.15s ease-in-out 2",
        "boat-rock": "boat-rock 2.4s ease-in-out infinite",
        "marker-pulse": "marker-pulse 1.8s ease-out infinite",
        "wake-fade": "wake-fade 0.6s ease-out forwards",
        "part-reveal": "part-reveal 0.6s ease-out forwards",
        "page-enter": "page-enter 0.2s ease-out",
        "splash-rise": "splash-rise 0.6s ease-out both",
        "loader-spin": "loader-spin 1.2s ease-in-out infinite",
        "loader-breathe": "loader-breathe 2s ease-in-out infinite",
        "loader-progress": "loader-progress 8s ease-out forwards",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "menu-in": "menu-in 150ms ease-out",
        sparkle: "sparkle 0.9s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
