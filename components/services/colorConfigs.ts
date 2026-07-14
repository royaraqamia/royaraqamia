export const colorConfigs = {
  teal: {
    gradient: 'linear-gradient(135deg, #14B8A6 0%, #0891B2 100%)',
    accentBorder: '#14B8A6',
    hoverGradient: 'linear-gradient(90deg, #14B8A6, #0891B2, #14B8A6)',
    glowColor: 'rgba(20, 184, 166, 0.3)',
  },
  orange: {
    gradient: 'linear-gradient(135deg, #F97316 0%, #D97706 100%)',
    accentBorder: '#F97316',
    hoverGradient: 'linear-gradient(90deg, #F97316, #D97706, #F97316)',
    glowColor: 'rgba(249, 115, 22, 0.3)',
  },
  blue: {
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    accentBorder: '#3B82F6',
    hoverGradient: 'linear-gradient(90deg, #3B82F6, #2563EB, #3B82F6)',
    glowColor: 'rgba(59, 130, 246, 0.3)',
  },
  pink: {
    gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
    accentBorder: '#EC4899',
    hoverGradient: 'linear-gradient(90deg, #EC4899, #DB2777, #EC4899)',
    glowColor: 'rgba(236, 72, 153, 0.3)',
  },
  emerald: {
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    accentBorder: '#10B981',
    hoverGradient: 'linear-gradient(90deg, #10B981, #059669, #10B981)',
    glowColor: 'rgba(16, 185, 129, 0.3)',
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
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    accentBorder: '#F59E0B',
    hoverGradient: 'linear-gradient(90deg, #F59E0B, #D97706, #F59E0B)',
    glowColor: 'rgba(245, 158, 11, 0.3)',
  },
  rose: {
    gradient: 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)',
    accentBorder: '#F43F5E',
    hoverGradient: 'linear-gradient(90deg, #F43F5E, #E11D48, #F43F5E)',
    glowColor: 'rgba(244, 63, 94, 0.3)',
  },
  cyan: {
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
    accentBorder: '#06B6D4',
    hoverGradient: 'linear-gradient(90deg, #06B6D4, #0891B2, #06B6D4)',
    glowColor: 'rgba(6, 182, 212, 0.3)',
  },
  indigo: {
    gradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    accentBorder: '#6366F1',
    hoverGradient: 'linear-gradient(90deg, #6366F1, #4F46E5, #6366F1)',
    glowColor: 'rgba(99, 102, 241, 0.3)',
  },
  lime: {
    gradient: 'linear-gradient(135deg, #84CC16 0%, #65A30D 100%)',
    accentBorder: '#84CC16',
    hoverGradient: 'linear-gradient(90deg, #84CC16, #65A30D, #84CC16)',
    glowColor: 'rgba(132, 204, 22, 0.3)',
  },
  coral: {
    gradient: 'linear-gradient(135deg, #FB7185 0%, #F43F5E 100%)',
    accentBorder: '#FB7185',
    hoverGradient: 'linear-gradient(90deg, #FB7185, #F43F5E, #FB7185)',
    glowColor: 'rgba(251, 113, 133, 0.3)',
  },
} as const;

export type ColorKey = keyof typeof colorConfigs;
