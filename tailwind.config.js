/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Editorial light system. One accent, no gradients, hierarchy from
        // type and hairline borders rather than shadows or fills.
        canvas: '#FFFFFF',
        // A hair warmer than neutral grey: paper rather than screen.
        surface: '#F8F7F4',
        line: '#E9E7E3',
        'line-strong': '#DCD9D3',
        ink: {
          DEFAULT: '#111111', // 18.1:1 on white
          secondary: '#666666', // 5.74:1 on white — AA
          // Darkened from #8A8A8A (3.45:1, failed AA) to meet WCAG AA for the
          // small, meaningful text it carries (nav labels, footer, hints).
          muted: '#737373', // 4.74:1 on white — AA
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
      boxShadow: {
        // Depth comes from one soft, low-contrast lift — never a heavy card.
        lift: '0 1px 2px rgba(17,17,17,0.03), 0 10px 28px -16px rgba(17,17,17,0.14)',
        dock: '0 1px 16px rgba(15,17,21,0.06)',
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
        // Sections arrive rather than appear — a clearer entrance than a swap.
        'section-in': {
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
        'section-in': 'section-in 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
        'ambient-drift': 'ambient-drift 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
