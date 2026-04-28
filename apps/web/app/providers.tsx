'use client';

import { ThemeProvider } from 'next-themes';
import { TRPCReactProvider } from '@/lib/trpc/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </ThemeProvider>
  );
}
