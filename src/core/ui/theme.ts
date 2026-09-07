import { useColorScheme } from 'react-native';

import { colorsFor, radius, spacing, typeScale, type Colors, type ColorScheme } from './tokens';

/**
 * Theme access for components.
 *
 * A hook rather than a context provider: the only thing that varies is the
 * colour scheme, and React Native already tracks that. Adding a provider would
 * be indirection with nothing behind it.
 */

export interface Theme {
  scheme: ColorScheme;
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  typeScale: typeof typeScale;
}

export function useTheme(): Theme {
  // useColorScheme returns null before the system value is known; light is the
  // safe default because it matches the splash screen.
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return {
    scheme,
    colors: colorsFor(scheme),
    spacing,
    radius,
    typeScale,
  };
}
