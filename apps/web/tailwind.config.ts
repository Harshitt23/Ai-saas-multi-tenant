import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0e0f13',
        panel: '#16181d',
        edge: '#262a33',
      },
    },
  },
  plugins: [],
} satisfies Config;
