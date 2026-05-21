export const colors = {
  bg: '#0a0a0a',
  surface1: '#111111',
  surface2: '#171717',
  surface3: '#1f1f1f',
  border: '#262626',
  borderStrong: '#3a3a3a',
  text: '#f5f5f5',
  textMuted: '#a1a1aa',
  textDim: '#71717a',
  brand: {
    50: '#f3f0ff',
    100: '#e9e3ff',
    200: '#d4c8ff',
    300: '#b6a0ff',
    400: '#9778ff',
    500: '#7c5cff',
    600: '#5b3fe0',
    700: '#4a31b8',
    800: '#392693',
    900: '#2a1d6f',
  },
  semantic: {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
  },
} as const;

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px',
} as const;

export const fonts = {
  sans: '"Inter Variable", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
  md: '0 4px 12px rgba(0, 0, 0, 0.5)',
  glow: '0 0 24px rgba(124, 92, 255, 0.25)',
} as const;

export const tokens = { colors, radius, space, fonts, shadow } as const;

export type Tokens = typeof tokens;
