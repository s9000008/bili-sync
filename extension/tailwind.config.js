/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bilibili: {
          pink: '#fb7299',
          blue: '#00a1d6',
        },
      },
    },
  },
  plugins: [],
};
