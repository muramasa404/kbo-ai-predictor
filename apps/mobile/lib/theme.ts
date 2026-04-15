/** Design tokens — 모바일 최적화 (iOS HIG + Material 3 혼합) */
export const colors = {
  bg: '#F5F5F7',
  card: '#FFFFFF',
  black: '#1D1D1F',
  blue: '#0071E3',
  blueLight: 'rgba(0,113,227,0.08)',
  green: '#30D158',
  red: '#FF453A',
  gold: '#FFD60A',
  goldBg: 'rgba(255,214,10,0.08)',
  silverBg: 'rgba(0,113,227,0.04)',
  text1: '#1D1D1F',
  text2: 'rgba(0,0,0,0.65)',
  text3: 'rgba(0,0,0,0.38)',
  border: 'rgba(0,0,0,0.06)',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 980,
}

export const fontSize = {
  xs: 10,
  sm: 12,
  body: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 32,
}

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
  black: '900' as const,
}
