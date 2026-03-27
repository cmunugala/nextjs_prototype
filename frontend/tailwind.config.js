/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mongo: {
          dark: '#1E293B', // Slate 800
          green: '#064E3B', // Deep forest
          sage: '#65A30D',  // Muted lime/green
          slate: '#334155', // Slate 700
          mist: '#F8FAFC',  // Slate 50
          orange: '#CC5801', // Custom requested orange
          gray: '#F1F5F9',   // Slate 100
        }
      }
    },
  },
  plugins: [],
}
