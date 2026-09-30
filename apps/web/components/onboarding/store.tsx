'use client';

import { type FontId, fontIdFrom } from '@udyamflow/tokens';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { browserTimezone } from '@/lib/timezones';

// Cross-step onboarding state. Persisted to sessionStorage so a refresh in the
// middle of the wizard doesn't blow away the user's input.
export type OnboardingState = {
  business: string;
  slug: string;
  email: string;
  templateId: 'doctor' | 'teacher' | 'sports' | 'salon' | 'therapist' | 'fitness';
  logoText: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  radius: number;
  /** Heading font id from FONT_OPTIONS (not a CSS stack). */
  fontDisplay: FontId;
  locations: Array<{
    id: string;
    name: string;
    address?: string;
    timezone: string;
    currency: 'USD' | 'INR';
  }>;
  organizationId?: string;
};

const DEFAULTS: OnboardingState = {
  business: '',
  slug: '',
  email: '',
  templateId: 'doctor',
  logoText: 'UF',
  accent: '#0f766e',
  accentSoft: '#ccfbf1',
  accentInk: '#134e4a',
  radius: 8,
  fontDisplay: 'inter',
  locations: [],
};

const STORAGE_KEY = 'udyamflow-onboarding-v1';

type Ctx = {
  state: OnboardingState;
  /** False until sessionStorage has been read — avoid redirecting on defaults. */
  hydrated: boolean;
  patch: (p: Partial<OnboardingState>) => void;
  reset: () => void;
};

const OnboardingCtx = createContext<Ctx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<OnboardingState>;
        // Older drafts stored locations without timezone / currency.
        const locations = (saved.locations ?? []).map((l) => ({
          ...l,
          timezone: l.timezone || browserTimezone(),
          currency: l.currency === 'USD' ? ('USD' as const) : ('INR' as const),
        }));
        // Drafts from before font ids stored a CSS stack.
        const fontDisplay = fontIdFrom(saved.fontDisplay);
        setState({ ...DEFAULTS, ...saved, fontDisplay, locations });
      }
    } catch {
      // ignore — sessionStorage unavailable or malformed
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [hydrated, state]);

  const patch = useCallback((p: Partial<OnboardingState>) => setState((s) => ({ ...s, ...p })), []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setState(DEFAULTS);
  }, []);

  return (
    <OnboardingCtx.Provider value={{ state, hydrated, patch, reset }}>
      {children}
    </OnboardingCtx.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingCtx);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
