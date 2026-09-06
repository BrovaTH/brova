import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0A0A0A",
          100: "#E7E5E1",
          200: "#D3D0CA",
          300: "#A7A39D",
          400: "#8A8681",
          500: "#6B6864",
          600: "#4A4845",
          700: "#242424",
          800: "#161616",
          900: "#0A0A0A",
        },
        bone: {
          DEFAULT: "#F5F4F2",
          200: "#EDEBE7",
          300: "#E3E1DC",
        },
        line: {
          DEFAULT: "#DEDBD6",
          soft: "#EAE8E4",
          hard: "#C4C0B9",
        },
        signal: {
          DEFAULT: "#8C2F2F",
          ok: "#2E6F4E",
          okbg: "#E4EFE8",
          warn: "#8A5A18",
          warnbg: "#F6EBDA",
          bad: "#8C2F2F",
          badbg: "#F6E2E2",
          info: "#2B4C6F",
          infobg: "#E3EAF1",
        },
      },
      fontFamily: {
        sans: ["Kanit", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: { wide2: "0.08em", display: "-0.02em" },
      borderRadius: { none: "0", DEFAULT: "0", md: "0", lg: "0", full: "0" },
    },
  },
  plugins: [],
};
export default config;
