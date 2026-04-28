/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#fbfaf8',
        surface: '#ffffff',
        'surface-mute': '#f5f4f0',
        border: '#e9e7e0',
        ink: '#1a1815',
        'ink-mute': '#5b574e',
        'ink-soft': '#8a857a',
        accent: '#0f766e',
      },
      fontFamily: {
        sans: ['Inter'],
      },
    },
  },
  plugins: [],
};
