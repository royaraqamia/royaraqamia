// Bio Theme - a modern, accessible color system with premium contrast ratios
const bioColors = {
  // Primary palette - premium neutral grays
  primary: {
    900: '#0f172a',
    800: '#1e293b',
    700: '#334155',
    600: '#475569',
    500: '#64748b',
    400: '#94a3b8',
    300: '#cbd5e1',
    200: '#e2e8f0',
    100: '#f1f5f9',
    50: '#f8fafc',
  },

  // Semantic colors with high contrast
  secondary: {
    900: '#7c3aed',
    800: '#a855f7',
    700: '#c084fc',
    600: '#e879f9',
    500: '#f0abfc',
    400: '#f9a8d4',
    300: '#fbcfe8',
    200: '#fce7f3',
    100: '#fdf2f8',
    50: '#fff1f5',
  },

  // Accent colors for highlighting and CTAs
  accent: { 500: '#10b981', 600: '#059669', 400: '#34d399', 700: '#047857', 300: '#6ee7b7' },

  // Status colors with accessibility
  success: { 500: '#10b981', 600: '#059669', 400: '#34d399' },
  warning: { 500: '#f59e0b', 600: '#d97706', 400: '#fbbf24' },
  error: { 500: '#ef4444', 600: '#dc2626', 400: '#f87171' },
  info: { 500: '#3b82f6', 600: '#2563eb', 400: '#60a5fa' },
};

// Typography scale with perfect modular third and fluid typography
const typography = {
  fontFamilies: {
    arabic: '"IBM Plex Sans Arabic", system-ui, sans-serif',
    heading: '"Aref Ruqaa", serif',
    sans: '"IBM Plex Sans Arabic", sans-serif',
  },

  // Fluid typography using clamp() for responsive scaling
  fluidFontSizes: {
    // Display (Hero sections) - fluid scaling
    h1: 'clamp(2rem, 5vw, 4rem)', // 32px -> 64px
    h2: 'clamp(1.75rem, 4vw, 3rem)', // 28px -> 48px
    h3: 'clamp(1.5rem, 3vw, 2.25rem)', // 24px -> 36px
    h4: 'clamp(1.25rem, 2.5vw, 1.75rem)', // 20px -> 28px
    h5: 'clamp(1.125rem, 2vw, 1.5rem)', // 18px -> 24px

    // Body text - fluid scaling
    body: 'clamp(1rem, 1.5vw, 1.125rem)', // 16px -> 18px
    small: 'clamp(0.875rem, 1.25vw, 1rem)', // 14px -> 16px
    xs: 'clamp(0.75rem, 1vw, 0.875rem)', // 12px -> 14px

    // Reading optimized
    reading: { maxWidth: '70ch', lineHeight: '1.6' },
  },

  // Legacy font sizes for backward compatibility
  fontSizes: {
    // Display (Hero sections)
    h1: { xs: '2rem', sm: '3rem', md: '4rem', lg: '5rem', xl: '6rem' }, // 48px -> 96px
    h2: { xs: '1.5rem', sm: '2.25rem', md: '3rem', lg: '4rem', xl: '5rem' }, // 36px -> 72px
    h3: { xs: '1.25rem', sm: '1.875rem', md: '2.5rem', lg: '3rem', xl: '4rem' }, // 30px -> 60px
    h4: { xs: '1.125rem', sm: '1.5rem', md: '2rem', lg: '2.5rem', xl: '3rem' }, // 24px -> 48px
    h5: { xs: '1rem', sm: '1.25rem', md: '1.5rem', lg: '1.875rem', xl: '2.5rem' }, // 20px -> 40px

    // Body text
    body: { xs: '0.875rem', sm: '1rem', md: '1.125rem', lg: '1.25rem', xl: '1.375rem' }, // 14px -> 22px
    small: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' }, // 12px -> 20px

    // Reading optimized
    reading: { maxWidth: '70ch', lineHeight: '1.6' },
  },

  fontWeights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    heavy: 800,
  },

  // Line height ratios for consistent vertical rhythm
  lineHeights: {
    tight: '1.2', // For headings
    snug: '1.3', // For subheadings
    normal: '1.5', // For body text
    relaxed: '1.6', // For reading text
    loose: '1.8', // For spacious text
  },

  // Letter spacing tokens for improved readability
  letterSpacing: {
    tight: '-0.02em', // For large headings
    normal: '0em', // Default
    wide: '0.05em', // For labels and small text
    extraWide: '0.1em', // For emphasis
  },

  // Typography utility classes
  heading: {
    lineHeight: '1.2',
    letterSpacing: '-0.02em',
  },
  subheading: {
    lineHeight: '1.3',
    letterSpacing: '-0.01em',
  },
  body: {
    lineHeight: '1.6',
    letterSpacing: '0em',
  },
  label: {
    lineHeight: '1.5',
    letterSpacing: '0.05em',
  },
};

// Spacing system with 8px base grid
const spacing = {
  // Base unit
  xs: '0.25rem', // 4px
  sm: '0.5rem', // 8px
  md: '1rem', // 16px
  lg: '1.5rem', // 24px
  xl: '2rem', // 32px
  xxl: '3rem', // 48px

  // Component specific
  container: { padding: 'clamp(1rem, 4vw, 2rem)' }, // Responsive padding
  card: { padding: 'clamp(1.5rem, 3vw, 2rem)', gap: '1.5rem' },
  form: { fieldSpacing: '1.5rem', groupSpacing: '2rem' },
  element: { gap: '1rem', gapSm: '0.75rem' },
};

// Shadow system with multi-layered, diffused shadows
const shadows = {
  // Base shadows
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',

  // Premium/elevated
  elevated: '0 20px 40px rgba(99, 102, 241, 0.12)',
  hover: '0 8px 25px rgba(99, 102, 241, 0.15)',
  focus: '0 0 0 3px rgba(99, 102, 241, 0.1)',

  // Color specific
  primary: '0 4px 14px rgba(99, 102, 241, 0.25)',
  success: '0 4px 14px rgba(16, 185, 129, 0.2)',
  warning: '0 4px 14px rgba(245, 158, 11, 0.2)',
  error: '0 4px 14px rgba(239, 68, 68, 0.2)',
};

// Border radius system with nested patterns
const radii = {
  // Base corners
  none: '0',
  sm: '0.375rem', // 6px
  md: '0.5rem', // 8px
  lg: '0.75rem', // 12px
  xl: '1rem', // 16px
  xxl: '1.5rem', // 24px
  full: '9999px', // pill shapes

  // Component patterns
  card: 'var(--radius-lg)',
  cardInternal: 'var(--radius-md)',
  button: 'var(--radius-full)',
  input: 'var(--radius-lg)',
  dialog: 'var(--radius-2xl)',

  // Nested radius patterns
  nested1: 'calc(var(--radius-card) - 4px)',
  nested2: 'calc(var(--radius-card-internal) - 2px)',
  nested3: 'calc(var(--radius-input) - 4px)',
};

// Animation system with premium easing
const animations = {
  // Duration
  fast: '0.15s',
  normal: '0.3s',
  slow: '0.6s',

  // Easing functions
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeSmooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',

  // Specific component animations
  button: {
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease',
    hover:
      'transform: scale(1.02) translateY(-2px); box-shadow: 0 10px 30px rgba(139, 92, 246, 0.2);',
    active: 'transform: scale(0.98);',
  },

  card: {
    transition:
      'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    hover:
      'transform: translateY(-8px); box-shadow: 0 20px 40px rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.3);',
    active: 'transform: scale(0.98); transition-duration: 0.1s;',
  },

  input: {
    transition:
      'border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },

  overlay: {
    transition:
      'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
  },
};
