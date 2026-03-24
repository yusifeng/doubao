export const colorTokens = {
  bgCanvas: 'amber-50',
  bgSurface: 'white',
  bgMuted: 'amber-100',
  bgAccent: 'orange-400',
  bgAccentStrong: 'rose-500',
  borderDefault: 'amber-200',
  borderSubtle: 'orange-200',
  textPrimary: 'slate-900',
  textSecondary: 'slate-600',
  textTertiary: 'slate-500',
  textOnMuted: 'slate-800',
  textOnAccent: 'white',
} as const;

export const spaceTokens = {
  screenX: 'px-5',
  screenY: 'py-6',
  sectionGap: 'mt-6',
  itemGap: 'mt-2',
  stackGap: 'mt-4',
  cardX: 'px-5',
  cardY: 'py-4',
  buttonX: 'px-4',
  buttonY: 'py-3',
} as const;

export const radiusTokens = {
  card: 'rounded-3xl',
  pill: 'rounded-full',
} as const;

export const typographyTokens = {
  title: 'text-4xl font-black',
  subtitle: 'text-2xl font-bold',
  body: 'text-[17px]',
  caption: 'text-sm',
} as const;
