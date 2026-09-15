/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#07090e',
        panel: '#10141d',
        mint: '#62f5c4',
      },
      boxShadow: {
        glow: '0 0 40px rgba(98, 245, 196, 0.16)',
      },
      screens: {
        tablet: '768px',
      },
    },
  },
  plugins: [],
};
