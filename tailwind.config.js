/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // <--- 關鍵就是加了這行！
  theme: {
    extend: {},
  },
  plugins: [],
}