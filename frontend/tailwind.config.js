/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Nunito', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#1E293B',
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        brandCyan: {
          DEFAULT: '#06B6D4',
          light: '#22D3EE',
          soft: '#CFFAFE',
        },
        brandPurple: {
          DEFAULT: '#8B5CF6',
          light: '#A78BFA',
          soft: '#EDE9FE',
        },
        canvas: '#F8FAFC',
        sapGreen: {
          DEFAULT: '#16A34A',
          soft: '#DCFCE7',
        },
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        soft: '0 6px 24px -8px rgba(15, 23, 42, 0.12)',
        card: '0 10px 32px -12px rgba(15, 23, 42, 0.18)',
        ring: '0 0 0 4px rgba(139, 92, 246, 0.15)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(6, 182, 212, 0.45)' },
          '50%': { boxShadow: '0 0 0 14px rgba(6, 182, 212, 0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'pop-in': 'pop-in 0.3s ease-out',
        'slide-up': 'slide-up 0.45s ease-out',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'glow': 'glow 2.4s ease-out infinite',
      },
    }
  },
  plugins: [require("tailwindcss-animate")],
};
