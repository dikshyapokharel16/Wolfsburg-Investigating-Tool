/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        wolfsburg: {
          blue: '#003A70',
          silver: '#9EA5A9',
          green: '#4A7C59',
        },
      },
    },
  },
  plugins: [],
}
