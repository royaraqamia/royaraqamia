/**
 * Design System Tokens
 * Centralized design tokens for spacing, typography, and colors
 * Used across Roya Homepage, Almudeer, and Sahwa landing pages
 */

export const spacing = {
  xs: '4px', // 0.25rem
  sm: '8px', // 0.5rem
  md: '16px', // 1rem
  lg: '24px', // 1.5rem
  xl: '32px', // 2rem
  '2xl': '48px', // 3rem
  '3xl': '64px', // 4rem
  '4xl': '96px', // 6rem
} as const;

export const typography = {
  // Heading sizes (standardized across all pages)
  h1: {
    fontSize: '48px', // 3rem
    lineHeight: '1.1',
    fontWeight: '700',
  },
  h2: {
    fontSize: '36px', // 2.25rem
    lineHeight: '1.1',
    fontWeight: '700',
  },
  h3: {
    fontSize: '30px', // 1.875rem
    lineHeight: '1.2',
    fontWeight: '600',
  },
  h4: {
    fontSize: '24px', // 1.5rem
    lineHeight: '1.3',
    fontWeight: '600',
  },
  // Body text
  body: {
    fontSize: '16px', // 1rem
    lineHeight: '1.6',
    fontWeight: '400',
  },
  bodyLarge: {
    fontSize: '18px', // 1.125rem
    lineHeight: '1.7',
    fontWeight: '400',
  },
  bodySmall: {
    fontSize: '14px', // 0.875rem
    lineHeight: '1.5',
    fontWeight: '400',
  },
} as const;

export const colors = {
  // Primary brand colors
  primary: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7766ee', // Main primary
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
    950: '#2e1065',
  },
  // Secondary/Accent colors
  teal: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
  },
  orange: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
  },
  // Brand-specific colors
  brand: {
    emerald: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
    },
  },
} as const;

// CSS custom properties for dynamic theming
export const cssVariables = {
  '--spacing-xs': spacing.xs,
  '--spacing-sm': spacing.sm,
  '--spacing-md': spacing.md,
  '--spacing-lg': spacing.lg,
  '--spacing-xl': spacing.xl,
  '--spacing-2xl': spacing['2xl'],
  '--spacing-3xl': spacing['3xl'],
  '--spacing-4xl': spacing['4xl'],
} as const;
