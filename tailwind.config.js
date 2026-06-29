/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0d1117',
        card: '#161b22',
        elevated: '#21262d',
        accent: '#2563eb',
        border: '#30363d',
        success: '#3fb950',
        warning: '#d29922',
      }
    }
  },
  plugins: []
}
