import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#090c11',
        surface: '#10141c',
        surface2: '#171d28',
        border: '#232d3f',
        text: '#e2e8f0',
        text2: '#7a8899',
        green: '#1fcc6e',
        red: '#f05454',
        amber: '#f0a940',
        accent: '#5b6aff',
        accent2: '#7c88ff',
      },
      fontFamily: {
        mono: ['DM Mono', 'monospace'],
        sans: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
