'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

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
  fontDisplay: string;
  locations: Array<{ id: string; name: string; address?: string }>;
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
  fontDisplay: '"Inter", system-ui, sans-serif',
  locations: [],
};

const STORAGE_KEY = 'udyamflow-onboarding-v1';

type Ctx = {
  state: OnboardingState;
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
      if (raw) setState({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<OnboardingState>) });
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
    sessionStorage.removeItem(STORAGE_KEY);
    setState(DEFAULTS);
  }, []);

  return (
    <OnboardingCtx.Provider value={{ state, patch, reset }}>{children}</OnboardingCtx.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingCtx);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
