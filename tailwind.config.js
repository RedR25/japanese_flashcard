/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { paper: v('paper'), card: v('card'), ink: v('ink'), muted: v('muted'), line: v('line'), seal: v('seal'), jade: v('jade') },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        ja: ['"Noto Serif JP"', 'serif'],
        zh: ['"Noto Serif SC"', 'serif'],
      },
    },
  },
  plugins: [],
};
