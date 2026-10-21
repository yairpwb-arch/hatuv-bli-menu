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
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
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
      },
      boxShadow: {
        'glow': '0 0 20px hsl(var(--primary) / 0.3)',
        'glow-lg': '0 0 40px hsl(var(--primary) / 0.4)',
      },
      keyframes: {
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
        sparkle: {
          "0%": { transform: "scale(0) translate(0, 0)", opacity: "0" },
          "40%": { opacity: "1" },
          "100%": { transform: "scale(1) translate(var(--sx), var(--sy))", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-up": "slide-up 0.5s ease-out forwards",
        "scale-in": "scale-in 0.3s ease-out forwards",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "bounce-in": "bounce-in 0.4s ease-out forwards",
        "pulse-glow": "pulse-glow 2s ease-out infinite",
        "splash-in": "splash-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "splash-out": "splash-out 0.6s ease-in forwards",
        "screen-shake": "screen-shake 0.15s ease-in-out 2",
        "boat-rock": "boat-rock 2.4s ease-in-out infinite",
        "marker-pulse": "marker-pulse 1.8s ease-out infinite",
        "wake-fade": "wake-fade 0.6s ease-out forwards",
        "part-reveal": "part-reveal 0.6s ease-out forwards",
        sparkle: "sparkle 0.9s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
