'use client';

import { type RefObject, useEffect } from 'react';

// Calls `onOutside` when a click lands outside the referenced element OR
// when the user presses Escape. Used for popovers, dropdowns, and modal-ish
// confirmation dialogs.

export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;

    function onPointer(e: PointerEvent) {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onOutside();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOutside();
    }

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onOutside, active]);
}
