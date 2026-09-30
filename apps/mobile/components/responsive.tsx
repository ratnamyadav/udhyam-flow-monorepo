import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

// Window size classes, following the Material 3 / Jetpack WindowManager
// breakpoints. We key off the *window* width (not the screen), so these
// update live when a foldable is opened or closed, when the app is dragged
// into split-screen / Stage Manager, or when a tablet rotates.
//
//   compact   < 600dp   phones, folded foldables, narrow split-screen
//   medium    < 840dp   unfolded book-style foldables, small tablets portrait
//   expanded  ≥ 840dp   tablets, unfolded foldables in landscape, desktops
export type WindowClass = 'compact' | 'medium' | 'expanded';

export const WINDOW_BREAKPOINTS = { medium: 600, expanded: 840 } as const;

export function getWindowClass(width: number): WindowClass {
  if (width >= WINDOW_BREAKPOINTS.expanded) return 'expanded';
  if (width >= WINDOW_BREAKPOINTS.medium) return 'medium';
  return 'compact';
}

export function useWindowClass(): WindowClass {
  const { width } = useWindowDimensions();
  return getWindowClass(width);
}

const MAX_WIDTH = { content: 720, form: 480 } as const;

// Centers screen content and caps its width so lines and cards don't stretch
// edge-to-edge on an unfolded foldable or tablet. No-op on compact windows.
export function ResponsiveContent({
  children,
  variant = 'content',
}: {
  children: ReactNode;
  variant?: keyof typeof MAX_WIDTH;
}) {
  return (
    <View style={{ width: '100%', maxWidth: MAX_WIDTH[variant], alignSelf: 'center' }}>
      {children}
    </View>
  );
}
