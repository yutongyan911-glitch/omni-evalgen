/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        cta: 'var(--color-cta)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        surfaceHover: 'var(--color-surface-hover)',
        textMain: 'var(--color-text-main)',
        textMuted: 'var(--color-text-muted)',
        borderSubtle: 'var(--color-border-subtle)',
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'sans-serif'],
        mono: ['"Fira Code"', 'monospace'],
      }
    },
  },
  plugins: [],
}
