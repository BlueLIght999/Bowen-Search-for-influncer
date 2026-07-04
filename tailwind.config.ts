import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202225",
        paper: "#f3f6f5",
        panel: "#ffffff",
        line: "#cad3d0",
        moss: "#3f6b57",
        coral: "#d95d4f",
        gold: "#c9962f",
        sky: "#457b9d"
      }
    }
  },
  plugins: []
};

export default config;
