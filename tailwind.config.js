/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Enterprise dark-navy palette (original, not copied from any brand)
        navy: {
          950: '#070b18',
          900: '#0b1122',
          850: '#0f1730',
          800: '#141d3b',
          700: '#1c294f',
          600: '#263466',
        },
        ink: {
          100: '#eef2ff',
          200: '#cdd6f4',
          300: '#9aa7cf',
          400: '#6b78a1',
        },
        accent: {
          DEFAULT: '#4f8cff',
          soft: '#6ea0ff',
          deep: '#2f6ae0',
        },
        good: '#34d399',
        warn: '#fbbf24',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
