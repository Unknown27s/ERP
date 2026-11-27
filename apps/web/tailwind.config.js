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
        canvas: 'rgb(var(--erp-canvas) / <alpha-value>)',
        surface: 'rgb(var(--erp-surface) / <alpha-value>)',
        line: 'rgb(var(--erp-border) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--erp-text) / <alpha-value>)',
          secondary: 'rgb(var(--erp-secondary) / <alpha-value>)',
          muted: 'rgb(var(--erp-muted) / <alpha-value>)',
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: 'rgb(var(--erp-primary) / <alpha-value>)',
          700: 'rgb(var(--erp-primary-hover) / <alpha-value>)',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        sidebar: {
          DEFAULT: '#0B0F19',
          surface: '#111827',
          border: '#1F2937',
          muted: '#6B7280',
          hover: '#1F2937',
          active: '#2563EB',
          text: '#E5E7EB',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'card': '0 1px 3px 0 rgba(16, 24, 40, 0.05), 0 1px 2px -1px rgba(16, 24, 40, 0.05)',
        'modal': '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
      }
    },
  },
  plugins: [],
}
