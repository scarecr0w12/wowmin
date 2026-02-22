/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./renderer/**/*.html",
    "./renderer/**/*.js",
    "./renderer/**/*.ts",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // WoW-inspired color palette
        'wow': {
          'gold': '#FFD100',
          'gold-dark': '#C9A000',
          'blue': '#0070DD',
          'blue-dark': '#0050A0',
          'green': '#0FFC00',
          'green-dark': '#00C000',
          'purple': '#A335EE',
          'purple-dark': '#7A25B0',
          'orange': '#FF8000',
          'orange-dark': '#C06000',
          'red': '#FF4040',
          'red-dark': '#C03030',
          'gray': '#9D9D9D',
          'gray-dark': '#6D6D6D',
          'white': '#FFFFFF',
          'common': '#FFFFFF',
          'uncommon': '#1EFF00',
          'rare': '#0070DD',
          'epic': '#A335EE',
          'legendary': '#FF8000',
          'artifact': '#E6CC80',
          'heirloom': '#00CCFF',
        },
        // Dark theme colors
        'dark': {
          'bg': '#1a1a1a',
          'bg-secondary': '#242424',
          'bg-tertiary': '#2d2d2d',
          'border': '#3d3d3d',
          'text': '#e0e0e0',
          'text-muted': '#9d9d9d',
        }
      },
      fontFamily: {
        'mono': ['Consolas', 'Monaco', 'Courier New', 'monospace'],
        'sans': ['Segoe UI', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
