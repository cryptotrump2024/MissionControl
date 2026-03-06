/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mission Control dark theme palette
        mc: {
          bg: {
            primary: '#0a0a0f',
            secondary: '#111118',
            tertiary: '#1a1a24',
            card: '#14141e',
            hover: '#1e1e2e',
          },
          border: {
            primary: '#2a2a3a',
            secondary: '#3a3a4a',
          },
          text: {
            primary: '#e8e8ee',
            secondary: '#a0a0b0',
            muted: '#606070',
          },
          accent: {
            green: '#22c55e',
            red: '#ef4444',
            amber: '#f59e0b',
            teal: '#14b8a6',
            purple: '#a855f7',
            blue: '#3b82f6',
          },
          tier: {
            governance: '#dc2626',
            executive: '#d97706',
            management: '#2563eb',
            operational: '#16a34a',
          }
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
