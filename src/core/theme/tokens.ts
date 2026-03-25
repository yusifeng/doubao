export const voiceAssistantPalette = {
  canvas: '#FFFFFF',
  canvasMuted: '#F9FAFB',
  surfaceSoft: '#F7F8FA',
  surfaceSoftAlt: '#F3F4F6',
  surfaceBlue: '#E8F2FF',
  surfaceBlueStrong: '#007AFF',
  surfacePink: '#FCE7F3',
  surfacePurple: '#F3E8FF',
  surfaceSky: '#E0F2FE',
  surfaceDanger: '#FEE2E2',
  surfaceVoiceButton: 'rgba(255,255,255,0.46)',
  borderSubtle: '#F3F4F6',
  borderCard: 'rgba(0,0,0,0.05)',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#9CA3AF',
  textOnBrand: '#FFFFFF',
  badgeBlue: '#3B82F6',
  badgeBlueBg: '#EFF6FF',
  badgeBlueBorder: '#DBEAFE',
  bubbleUser: '#0A7CFF',
  bubbleAssistant: '#F4F5F7',
  bubbleAssistantCard: '#F7F8FA',
  shadowWarm: 'rgba(17, 24, 39, 0.08)',
  shadowVoice: 'rgba(148, 163, 184, 0.18)',
} as const;

export const voiceAssistantSpacing = {
  screenX: 'px-4',
  headerX: 'px-4',
  listRowY: 'py-4',
  listRowX: 'px-4',
  chipRowGap: 'gap-2',
  composerInset: 'px-4 pb-5 pt-3',
} as const;

export const voiceAssistantRadius = {
  full: 'rounded-full',
  card: 'rounded-[24px]',
  bubble: 'rounded-[20px]',
  sheet: 'rounded-[28px]',
} as const;

export const voiceAssistantTypography = {
  title: 'text-[18px] font-semibold text-slate-900',
  subtitle: 'text-[14px] leading-5 text-slate-400',
  body: 'text-[16px] leading-6 text-slate-800',
  caption: 'text-[12px] leading-4 text-slate-500',
} as const;
