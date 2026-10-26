export const COLORS = {
  primary: '#153E78',
  navy: '#0A2047',

  background: '#F3F7FC',
  backgroundDark: '#0A2047',

  card: '#FFFFFF',
  inputBackground: '#FBFCFE',
  surface: '#E8F0FA',

  textPrimary: '#14233A',
  textSecondary: '#60718A',
  textMuted: '#76859A',
  textOnPrimary: '#FFFFFF',

  border: '#DCE5F0',
  shadow: '#0A2047',

  logo: '#0A2047',

  success: '#187252',
  warning: '#C97A2B',
  error: '#B3261E',
  danger: '#B3261E',

  successSurface: '#F2FDF5',
  errorSurface: '#FFF7F6',
} as const;

/**
 * Global app background: a blue to light-blue gradient.
 * The top is a readable medium blue (dark text still passes contrast there)
 * and it fades to a near-white light blue at the bottom.
 */
export const GRADIENT = {
  screen: ['#6FAEE4', '#93C6EC', '#B8DAF6', '#E3F1FB'] as const,
  locations: [0, 0.35, 0.72, 1] as const,
} as const;
