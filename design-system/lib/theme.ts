// Design System Theme Configuration
// This file defines the complete design system theme for Bio Theme
// Including colors, typography, spacing, shadows, animations, and more

export const bioDesignTheme = {
  // Core design tokens
  colors: {
    transparent: 'transparent',
    current: 'currentColor',

    // Primary palette - premium grays
    slate: {
      50: '#f8fafc', // Lightest
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a', // Darkest (primary)
      950: '#020617', // Nearly black
    },

    violet: {
      50: '#fdf2f8',
      100: '#fce7f3',
      200: '#fbcfe8',
      300: '#f9a8d4',
      400: '#e879f9',
      500: '#c084fc',
      600: '#a855f7',
      700: '#9333ea',
      800: '#7e22ce',
      900: '#6b21a8',
    },

    // Semantic colors
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',

    // Accent colors
    teal: '#14b8a6',
    orange: '#f97316',
    purple: '#a855f7',
  },

  // Typography
  fontFamily: {
    sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
    serif: ['"Aref Ruqaa"', 'serif'],
    arabic: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
  },

  fontSize: {
    xs: ['0.75rem', { lineHeight: '1.5' }], // 12px
    sm: ['0.875rem', { lineHeight: '1.5' }], // 14px
    base: ['1rem', { lineHeight: '1.6' }], // 16px
    lg: ['1.125rem', { lineHeight: '1.6' }], // 18px
    xl: ['1.25rem', { lineHeight: '1.5' }], // 20px
    '2xl': ['1.5rem', { lineHeight: '1.3' }], // 24px
    '3xl': ['1.875rem', { lineHeight: '1.3' }], // 30px
    '4xl': ['2.25rem', { lineHeight: '1.2' }], // 36px
    '5xl': ['3rem', { lineHeight: '1.2' }], // 48px
    '6xl': ['3.75rem', { lineHeight: '1.1' }], // 60px
  },

  fontWeight: {
    thin: '100',
    extralight: '200',
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },

  // Border radius
  borderRadius: {
    none: '0',
    sm: '0.375rem', // 6px
    md: '0.5rem', // 8px
    lg: '0.75rem', // 12px
    xl: '1rem', // 16px
    '2xl': '1.5rem', // 24px
    '3xl': '2rem', // 32px
    full: '9999px',
  },

  // Spacing (via Tailwind's default spacing scale)
  spacing: {
    px: '1px',
    0.5: '0.125rem', // 2px
    1: '0.25rem', // 4px
    1.5: '0.375rem', // 6px
    2: '0.5rem', // 8px
    2.5: '0.625rem', // 10px
    3: '0.75rem', // 12px
    3.5: '0.875rem', // 14px
    4: '1rem', // 16px
    5: '1.25rem', // 20px
    6: '1.5rem', // 24px
    7: '1.75rem', // 28px
    8: '2rem', // 32px
    9: '2.25rem', // 36px
    10: '2.5rem', // 40px
    12: '3rem', // 48px
    16: '4rem', // 64px
    20: '5rem', // 80px
    24: '6rem', // 96px
    32: '8rem', // 128px
    40: '10rem', // 160px
    48: '12rem', // 192px
    56: '14rem', // 224px
    64: '16rem', // 256px
  },

  // Shadows
  boxShadow: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.06)',
    none: 'none',
    // Premium/variant shadows
    soft: '0 2px 8px -1px rgb(99 102 241 / 0.12)',
    softLg: '0 8px 32px -4px rgb(99 102 241 / 0.18)',
    softXl: '0 20px 40px -8px rgb(99 102 241 / 0.25)',
    hover: '0 4px 14px -2px rgb(99 102 241 / 0.25)',
    hoverLg: '0 8px 25px -4px rgb(99 102 241 / 0.35)',
    focus: '0 0 0 4px rgb(99 102 241 / 0.1)',
  },

  // Animations
  animation: {
    none: 'none',
    spin: 'spin 1s linear infinite',
    ping: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
    pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    bounce: 'bounce 1s infinite',
    // Premium animations
    float: 'float 3s ease-in-out infinite',
    shimmer: 'shimmer 2s linear infinite',
    'shimmer-slow': 'shimmer 5s linear infinite',
    'fade-in': 'fade-in 0.5s ease-out',
    'fade-in-up': 'fade-in-up 0.8s ease-out',
    'scale-in': 'scale-in 0.3s ease-out',
    'scale-out': 'scale-out 0.3s ease-in',
  },

  // Keyframes for premium animations
  keyframes: {
    float: {
      '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
      '50%': { transform: 'translateY(-10px) rotate(3deg)' },
    },
    shimmer: {
      '0%': { transform: 'translateX(-100%) skewX(-20deg)' },
      '100%': { transform: 'translateX(200%) skewX(-20deg)' },
    },
    'fade-in': {
      '0%': { opacity: '0' },
      '100%': { opacity: '1' },
    },
    'fade-in-up': {
      '0%': { opacity: '0', transform: 'translateY(20px)' },
      '100%': { opacity: '1', transform: 'translateY(0)' },
    },
    'scale-in': {
      '0%': { opacity: '0', transform: 'scale(0.95)' },
      '100%': { opacity: '1', transform: 'scale(1)' },
    },
    'scale-out': {
      '0%': { opacity: '1', transform: 'scale(1)' },
      '100%': { opacity: '0', transform: 'scale(0.95)' },
    },
  },

  // Extended custom properties
  extend: {
    colors: {
      // Bio theme specific colors
      border: 'hsl(var(--border))',
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))',
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))',
      },
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },
      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))',
      },
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
      },
    },

    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
      xl: 'calc(var(--radius) + 4px)',
      '2xl': 'calc(var(--radius) + 8px)',
    },

    boxShadow: {
      // Premium shadow system
      'soft-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
      'soft-xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.05)',
      'soft-2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      'hover-sm': '0 4px 14px -2px rgb(99 102 241 / 0.25)',
      'hover-md': '0 8px 25px -4px rgb(99 102 241 / 0.35)',
      'hover-lg': '0 12px 40px -6px rgb(99 102 241 / 0.45)',
      'focus-ring': '0 0 0 3px rgb(var(--ring) / 0.1)',
      'focus-ring-lg': '0 0 0 6px rgb(var(--ring) / 0.15)',
    },
  },
};

export type BioTheme = typeof bioDesignTheme;
