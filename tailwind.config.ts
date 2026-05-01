import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Warm off-white backgrounds inspired by the design
        cream: {
          50: '#faf8f3',
          100: '#f5f1e8',
          200: '#ede6d3',
        },
        // Dark sidebar
        ink: {
          900: '#0f0f0f',
          800: '#1a1a1a',
          700: '#262626',
          600: '#3f3f3f',
        },
        // Pastel accent colors
        pastel: {
          pink: '#f8d7e0',
          pinkDeep: '#f1b5c6',
          mint: '#d6ebd9',
          mintDeep: '#a8d5b0',
          lemon: '#f9ecb4',
          lemonDeep: '#f2d97a',
          lavender: '#ddd6f3',
          lavenderDeep: '#b9acdc',
          peach: '#fadcc1',
          peachDeep: '#f2b88a',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(15, 15, 15, 0.06)',
        card: '0 4px 24px rgba(15, 15, 15, 0.08)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}

export default config
