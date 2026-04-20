import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        muted: "#62666b",
        paper: "#f7f5f2",
        surface: "#fffdf9",
        line: "#ded7cf",
        brand: "#E86F32",
        accent: "#1c1c1c",
        copper: "#b95428",
        ok: "#15803d",
        warn: "#b45309",
        danger: "#b91c1c"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(17, 17, 17, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
