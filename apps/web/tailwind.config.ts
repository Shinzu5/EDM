import type { Config } from 'tailwindcss';

/** MediData design system — dense enterprise look, dark sidebar, brand accents. */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          500: '#2f7df6',
          600: '#1b63d8',
          700: '#174ea6',
          900: '#123059',
        },
        sidebar: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
      },
    },
  },
  plugins: [],
};

export default config;
