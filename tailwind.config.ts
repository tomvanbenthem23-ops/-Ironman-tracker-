import type { Config } from 'tailwindcss';

/**
 * Designtokens uit sectie 9 van IRONMAN_PROMPT.md staan onder de `im-` prefix.
 * De shadcn/ui-tokens (border, background, primary, …) blijven staan zodat de
 * meegeleverde componenten in components/ui blijven werken.
 */
export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      colors: {
        // --- Ironman-tracker ---
        im: {
          bg: '#f4f6f8',
          card: '#ffffff',
          ink: '#1c2733',
          muted: '#6b7a8a',
          line: '#ccd4dc',
          accent: '#e2504c',
          good: '#2e9e5b',
          warn: '#e08a00',
          bad: '#dd3333',
          navy: '#16222f',
          'navy-2': '#233a52',
          'navy-soft': '#aec3d8',
          'on-navy-good': '#7fe0a7',
          'on-navy-bad': '#ffb0a8',
          extras: '#eef1f4',
          'extras-on': '#dff3e6',
          hairline: '#e3e8ee'
        },
        // disciplinekleuren: [fase 1 vulling, fase 1 rand, fase 2 vulling, fase 2 rand]
        run: {
          100: '#d5e8d4',
          500: '#82b366',
          200: '#ea9999',
          600: '#b3423c'
        },
        fiets: {
          100: '#ffe6cc',
          500: '#d79b00',
          200: '#ffe599',
          600: '#bf9000'
        },
        zwem: {
          100: '#dae8fc',
          500: '#6c8ebf',
          200: '#9fc5e8',
          600: '#3d85c6'
        },
        kracht: {
          100: '#f8cecc',
          500: '#b85450',
          200: '#b6d7a8',
          600: '#6aa84f'
        },
        // --- shadcn/ui ---
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      backgroundImage: {
        'im-navy': 'linear-gradient(135deg,#16222f,#233a52)',
        'im-hero': 'linear-gradient(135deg,#16222f,#2b4763)',
        'im-race': 'linear-gradient(135deg,#16222f,#39536f)'
      },
      boxShadow: {
        'im-card': '0 1px 3px rgba(0,0,0,.07)',
        'im-day': '0 1px 2px rgba(0,0,0,.05)'
      },
      borderRadius: {
        'im-ctl': '8px',
        'im-day': '10px',
        'im-card': '14px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
} satisfies Config;
