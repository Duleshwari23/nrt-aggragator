/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        impact: { primary: "#1b7fff" },
        cause: { primary: "#ff6b2c" },
        anomaly: "#ff3b3b",
        surface: { 
          100: "#0b0f14", 
          200: "#11161d"
        }
      },
      fontFamily: {
        'sans': ['Figtree', 'system-ui', 'sans-serif'],
        'body': ['DM Sans', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
