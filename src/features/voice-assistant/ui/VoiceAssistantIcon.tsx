import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

type VoiceAssistantIconName =
  | 'menu'
  | 'grid'
  | 'text'
  | 'back'
  | 'phone'
  | 'volume'
  | 'copy'
  | 'speaker'
  | 'bookmark'
  | 'retry'
  | 'camera'
  | 'mic'
  | 'mic_off'
  | 'plus'
  | 'search'
  | 'edit'
  | 'chat'
  | 'compose'
  | 'profile'
  | 'image'
  | 'video'
  | 'close'
  | 'spark'
  | 'settings';

type VoiceAssistantIconProps = {
  name: VoiceAssistantIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function VoiceAssistantIcon({
  name,
  size = 22,
  color = '#1F2937',
  strokeWidth = 1.9,
}: VoiceAssistantIconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  switch (name) {
    case 'menu':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="5" cy="12" r="1.7" fill={color} />
          <Circle cx="12" cy="12" r="1.7" fill={color} />
          <Circle cx="19" cy="12" r="1.7" fill={color} />
        </Svg>
      );
    case 'grid':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="4" y="4" width="5" height="5" rx="1" {...common} />
          <Rect x="11.5" y="4" width="5" height="5" rx="1" {...common} />
          <Rect x="4" y="11.5" width="5" height="5" rx="1" {...common} />
          <Rect x="11.5" y="11.5" width="5" height="5" rx="1" {...common} />
        </Svg>
      );
    case 'text':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 7h12" {...common} />
          <Path d="M12 7v10" {...common} />
          <Path d="M8.5 17h7" {...common} />
        </Svg>
      );
    case 'back':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M15 5l-7 7 7 7" {...common} />
        </Svg>
      );
    case 'phone':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M7.5 4.5h3l1.2 4-1.9 1.9c.9 1.8 2.3 3.2 4.1 4.1l1.9-1.9 4 1.2v3c0 .8-.7 1.5-1.5 1.5C11 19.8 4.2 13 4.2 5.9 4.2 5.1 4.9 4.5 5.7 4.5h1.8Z" {...common} />
        </Svg>
      );
    case 'volume':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 14h3.2l4.3 4V6L8.2 10H5Z" {...common} />
          <Path d="M16 9.5c1.5 1.2 1.5 3.8 0 5" {...common} />
          <Path d="M18.5 7c3 2.5 3 7.5 0 10" {...common} />
        </Svg>
      );
    case 'copy':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="9" y="7" width="10" height="12" rx="2" {...common} />
          <Path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" {...common} />
        </Svg>
      );
    case 'speaker':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4.5 13h3l4 3.5V7.5l-4 3.5h-3Z" {...common} />
          <Path d="M15 10.5c1 1 1 2 0 3" {...common} />
          <Path d="M17.5 8.5c2 2 2 5 0 7" {...common} />
        </Svg>
      );
    case 'bookmark':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M7 5.5h10v13l-5-3-5 3Z" {...common} />
        </Svg>
      );
    case 'retry':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M20 6v5h-5" {...common} />
          <Path d="M19 11a7 7 0 1 1-2.1-5" {...common} />
        </Svg>
      );
    case 'camera':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="4" y="7" width="16" height="12" rx="3" {...common} />
          <Path d="M9 7l1.5-2h3L15 7" {...common} />
          <Circle cx="12" cy="13" r="3.3" {...common} />
        </Svg>
      );
    case 'mic':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="9" y="4" width="6" height="10" rx="3" {...common} />
          <Path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" {...common} />
          <Path d="M12 17v3" {...common} />
          <Path d="M9 20h6" {...common} />
        </Svg>
      );
    case 'mic_off':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="9" y="4" width="6" height="10" rx="3" {...common} />
          <Path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" {...common} />
          <Path d="M12 17v3" {...common} />
          <Path d="M9 20h6" {...common} />
          <Path d="M5 5l14 14" stroke={color} strokeWidth={strokeWidth + 0.8} strokeLinecap="round" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 5v14" {...common} />
          <Path d="M5 12h14" {...common} />
        </Svg>
      );
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="11" cy="11" r="5.5" {...common} />
          <Path d="M16 16l3.5 3.5" {...common} />
        </Svg>
      );
    case 'edit':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 20h4l9.5-9.5-4-4L4 16Z" {...common} />
          <Path d="M12.5 6.5l4 4" {...common} />
        </Svg>
      );
    case 'compose':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="4" y="4" width="13" height="16" rx="2" {...common} />
          <Path d="M15.5 3.5l4 4" {...common} />
          <Path d="M19.5 7.5l-8 8H8v-3.5l8-8Z" {...common} />
        </Svg>
      );
    case 'chat':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 7.5h12A2.5 2.5 0 0 1 20.5 10v6A2.5 2.5 0 0 1 18 18.5H11l-4.5 3v-3H6A2.5 2.5 0 0 1 3.5 16v-6A2.5 2.5 0 0 1 6 7.5Z" {...common} />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="8" r="3.5" {...common} />
          <Path d="M5 19c1.8-3 4.1-4.5 7-4.5S17.2 16 19 19" {...common} />
        </Svg>
      );
    case 'image':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="4" y="5" width="16" height="14" rx="3" {...common} />
          <Circle cx="9" cy="10" r="1.7" {...common} />
          <Path d="M6.5 17l4.2-4.3 2.8 2.8 2.8-3 1.2 1.5" {...common} />
        </Svg>
      );
    case 'video':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="4" y="7" width="11" height="10" rx="2.5" {...common} />
          <Path d="M15 10.5 20 8v8l-5-2.5Z" {...common} />
        </Svg>
      );
    case 'close':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 6l12 12" {...common} />
          <Path d="M18 6 6 18" {...common} />
        </Svg>
      );
    case 'spark':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8Z" {...common} />
          <Line x1="18" y1="4" x2="18" y2="7" {...common} />
          <Line x1="19.5" y1="5.5" x2="16.5" y2="5.5" {...common} />
        </Svg>
      );
    case 'settings':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="3.2" {...common} />
          <Path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.1 7.1 0 0 0-2.1-1.2l-.3-2.5h-4l-.3 2.5a7.1 7.1 0 0 0-2.1 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1c.6.5 1.3.9 2.1 1.2l.3 2.5h4l.3-2.5c.8-.3 1.5-.7 2.1-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z" {...common} />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polyline points="4,12 10,18 20,6" {...common} />
        </Svg>
      );
  }
}
