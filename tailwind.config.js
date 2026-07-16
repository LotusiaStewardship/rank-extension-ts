/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: ['./entrypoints/**/*.{html,js,vue,ts}', './components/**/*.{vue,ts}', './utils/**/*.ts'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        lotusiaPink: {
          50: '#fef0f6',
          100: '#fde3ef',
          200: '#fbc7df',
          300: '#f89ac3',
          400: '#f35d9d',
          500: '#ec357a',
          600: '#c6005c',  /* Primary brand pink */
          700: '#a80050',
          800: '#8d0146',
          900: '#76053e',
          950: '#480022',
        },
        lotusiaPurple: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',  /* Primary brand purple */
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
      },
      borderRadius: {
        lotusia: '0.5rem',
        'lotusia-sm': '0.375rem',
        'lotusia-lg': '0.75rem',
        'lotusia-xl': '1rem',
      },
      boxShadow: {
        'elevation-1': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'elevation-2': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'elevation-3': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'elevation-4': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [import('tailwindcss-animate')],
}
