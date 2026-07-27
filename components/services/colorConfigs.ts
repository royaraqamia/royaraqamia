export const colorConfigs = {
  teal: {
    gradient: 'linear-gradient(135deg, #6D28D9 0%, #5B21B6 100%)',
    accentBorder: '#6D28D9',
    hoverGradient: 'linear-gradient(90deg, #6D28D9, #5B21B6, #6D28D9)',
    glowColor: 'rgba(109, 40, 217, 0.3)',
  },
  orange: {
    gradient: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 100%)',
    accentBorder: '#9333EA',
    hoverGradient: 'linear-gradient(90deg, #9333EA, #7E22CE, #9333EA)',
    glowColor: 'rgba(147, 51, 234, 0.3)',
  },
  blue: {
    gradient: 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
    accentBorder: '#4F46E5',
    hoverGradient: 'linear-gradient(90deg, #4F46E5, #4338CA, #4F46E5)',
    glowColor: 'rgba(79, 70, 229, 0.3)',
  },
  pink: {
    gradient: 'linear-gradient(135deg, #D946EF 0%, #C026D3 100%)',
    accentBorder: '#D946EF',
    hoverGradient: 'linear-gradient(90deg, #D946EF, #C026D3, #D946EF)',
    glowColor: 'rgba(217, 70, 239, 0.3)',
  },
  emerald: {
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    accentBorder: '#8B5CF6',
    hoverGradient: 'linear-gradient(90deg, #8B5CF6, #7C3AED, #8B5CF6)',
    glowColor: 'rgba(139, 92, 246, 0.3)',
  },
  violet: {
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    accentBorder: '#8B5CF6',
    hoverGradient: 'linear-gradient(90deg, #8B5CF6, #7C3AED, #8B5CF6)',
    glowColor: 'rgba(139, 92, 246, 0.3)',
  },
  purple: {
    gradient: 'linear-gradient(135deg, #A855F7 0%, #6366F1 100%)',
    accentBorder: '#A855F7',
    hoverGradient: 'linear-gradient(90deg, #A855F7, #6366F1, #A855F7)',
    glowColor: 'rgba(168, 85, 247, 0.3)',
  },
  amber: {
    gradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    accentBorder: '#6366F1',
    hoverGradient: 'linear-gradient(90deg, #6366F1, #4F46E5, #6366F1)',
    glowColor: 'rgba(99, 102, 241, 0.3)',
  },
  rose: {
    gradient: 'linear-gradient(135deg, #C084FC 0%, #A855F7 100%)',
    accentBorder: '#C084FC',
    hoverGradient: 'linear-gradient(90deg, #C084FC, #A855F7, #C084FC)',
    glowColor: 'rgba(192, 132, 252, 0.3)',
  },
  cyan: {
    gradient: 'linear-gradient(135deg, #818CF8 0%, #6366F1 100%)',
    accentBorder: '#818CF8',
    hoverGradient: 'linear-gradient(90deg, #818CF8, #6366F1, #818CF8)',
    glowColor: 'rgba(129, 140, 248, 0.3)',
  },
  indigo: {
    gradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    accentBorder: '#6366F1',
    hoverGradient: 'linear-gradient(90deg, #6366F1, #4F46E5, #6366F1)',
    glowColor: 'rgba(99, 102, 241, 0.3)',
  },
  lime: {
    gradient: 'linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)',
    accentBorder: '#A78BFA',
    hoverGradient: 'linear-gradient(90deg, #A78BFA, #8B5CF6, #A78BFA)',
    glowColor: 'rgba(167, 139, 250, 0.3)',
  },
  coral: {
    gradient: 'linear-gradient(135deg, #E879F9 0%, #D946EF 100%)',
    accentBorder: '#E879F9',
    hoverGradient: 'linear-gradient(90deg, #E879F9, #D946EF, #E879F9)',
    glowColor: 'rgba(232, 121, 249, 0.3)',
  },
} as const;

export type ColorKey = keyof typeof colorConfigs;
