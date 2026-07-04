// tailwind.config.js
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  // Note: Tailwind v3.4+ automatically ignores node_modules directories
  // The warning about matching node_modules is a false positive - Tailwind
  // will not actually process files in node_modules even if the pattern matches
  // If you want to suppress the warning, you can remove nested node_modules
  // directories (e.g., src/pages/almudeeralraqami/node_modules) since the
  // standalone app is now integrated into the main app
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        primary: {
          DEFAULT: '#7766ee', // Main primary color
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7766ee', // Main primary - standardized
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        secondary: 'hsl(var(--secondary) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        accent: {
          // SahwatalInsan accent colors (Gold/Amber scale)
          500: '#f59e0b', // Gold - Secondary
          600: '#d97706',
          // Main app accent (kept for compatibility)
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
        },
        destructive: 'hsl(var(--destructive) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        'accent-teal': 'hsl(var(--accent-teal) / <alpha-value>)',
        'accent-orange': 'hsl(var(--accent-orange) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        brand: {
          // SahwatalInsan brand colors (Emerald scale)
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981', // Emerald - Primary
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
          // Main app brand colors (kept for compatibility)
          dark: '#020617', // Slate 950
          surface: '#0f172a', // Slate 900
          accent: '#06b6d4', // Cyan 500
        },
        roya: {
          primary: '#6d28d9',
          dark: '#0f172a'
        },
      },
      fontFamily: {
        arabic: ['IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        heading: ['Aref Ruqaa', 'serif'],
        sans: ['"IBM Plex Sans Arabic"', 'sans-serif'],
      },
      fontSize: {
        // Standardized typography scale with responsive variants
        'h1': ['clamp(32px, 5vw, 48px)', { lineHeight: '1.1', fontWeight: '700' }],
        'h2': ['clamp(28px, 4vw, 36px)', { lineHeight: '1.1', fontWeight: '700' }],
        'h3': ['clamp(24px, 3vw, 30px)', { lineHeight: '1.2', fontWeight: '600' }],
        'h4': ['clamp(20px, 2.5vw, 24px)', { lineHeight: '1.3', fontWeight: '600' }],
        'body': ['clamp(14px, 1.5vw, 16px)', { lineHeight: '1.6', fontWeight: '400' }],
        'body-lg': ['clamp(16px, 2vw, 18px)', { lineHeight: '1.7', fontWeight: '400' }],
        'body-sm': ['clamp(12px, 1.2vw, 14px)', { lineHeight: '1.5', fontWeight: '400' }],
      },
      spacing: {
        // Standardized spacing scale
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
        '3xl': '64px',
        '4xl': '96px',
      },
      backgroundImage: {
        'gradient-teal': 'linear-gradient(135deg, #26A69A 0%, #00897B 100%)',
        'gradient-orange': 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
        'gradient-blue': 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)',
        'gradient-green': 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float-delayed 3.5s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shine': 'shine 2s linear infinite',
        'gradient': 'gradient 15s ease infinite',
        'fade-in-up': 'fadeInUp 1s ease-out forwards',
        // Mobile idle animations for CTA buttons
        'shimmer-slide': 'shimmer-slide 5s ease-in-out infinite',
        'border-pulse-orange': 'border-pulse-orange 3s ease-in-out infinite',
        'border-pulse-purple': 'border-pulse-purple 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'float-delayed': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-15px) rotate(-3deg)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shine: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        gradient: {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(38, 166, 154, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(38, 166, 154, 0.5)' },
        },
        // Shimmer slide for mobile idle effect - quick flash every 5s
        'shimmer-slide': {
          '0%, 90%, 100%': { transform: 'translateX(-100%) skewX(-20deg)' },
          '95%': { transform: 'translateX(200%) skewX(-20deg)' },
        },
        // Border pulse animations for orange/purple buttons
        'border-pulse-orange': {
          '0%, 100%': { borderColor: 'rgba(249, 115, 22, 0.2)' },
          '50%': { borderColor: 'rgba(249, 115, 22, 0.45)' },
        },
        'border-pulse-purple': {
          '0%, 100%': { borderColor: 'rgba(168, 85, 247, 0.2)' },
          '50%': { borderColor: 'rgba(168, 85, 247, 0.45)' },
        },
      },
    },
  },
  plugins: [],
};
