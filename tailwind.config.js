/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",  // VERY IMPORTANT: ensures Tailwind scans your React components
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
