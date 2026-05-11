import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#0F172A',
          border: '#1E293B',
          text: '#94A3B8',
          'text-active': '#F1F5F9',
          'item-active': '#1E3A5F',
          'item-hover': '#1E293B',
        },
        primary: {
          DEFAULT: '#4338CA',
          hover: '#3730A3',
          light: '#EEF2FF',
          fg: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1.5' }],
        sm: ['12px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.6' }],
        md: ['15px', { lineHeight: '1.5' }],
        lg: ['16px', { lineHeight: '1.4' }],
        xl: ['18px', { lineHeight: '1.4' }],
        '2xl': ['22px', { lineHeight: '1.3' }],
        '3xl': ['28px', { lineHeight: '1.2' }],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
        dropdown: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        modal: '0 20px 40px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '8px',
      },
    },
  },
  plugins: [],
} satisfies Config
