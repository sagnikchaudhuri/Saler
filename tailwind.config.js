/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Editorial light system. One accent, no gradients, hierarchy from
        // type and hairline borders rather than shadows or fills.
        canvas: '#FFFFFF',
        surface: '#F7F7F5',
        line: '#EAEAEA',
        ink: {
          DEFAULT: '#111111',
          secondary: '#666666',
          muted: '#8A8A8A',
        },
        accent: {
          DEFAULT: '#315CFF',
          hover: '#2447D8',
          wash: '#F0F3FF',
        },
        positive: '#15835B',
        caution: '#B66A08',
        critical: '#C73E3E',
      },
      fontFamily: {
        // System stack only — nothing to download, nothing to license.
        sans: [
          'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI',
          'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      letterSpacing: {
        editorial: '-0.03em',
      },
      keyframes: {
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'turn-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        // The interface "grows" out of the wordmark as the letters disperse.
        'app-reveal': {
          '0%': { opacity: '0', transform: 'scale(0.985)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'intro-letter': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ambient-drift': {
          '0%': { transform: 'translateX(-40%)' },
          '100%': { transform: 'translateX(140%)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'turn-in': 'turn-in 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
        'app-reveal': 'app-reveal 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        'ambient-drift': 'ambient-drift 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
