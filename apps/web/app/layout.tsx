import type { Metadata } from 'next';
import {
  DM_Sans,
  Fraunces,
  Inter,
  JetBrains_Mono,
  Lora,
  Nunito,
  Playfair_Display,
  Space_Grotesk,
} from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Every font a tenant can pick (FONT_OPTIONS in @udyamflow/tokens) is loaded
// here under the exact CSS variable `fontStack()` points at — always reference
// fonts through these variables, never literal family names.
// Inter / Fraunces / JetBrains Mono are the product's own fonts and preload;
// the tenant-only ones don't, so browsers fetch them only when a page uses them.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  style: ['italic', 'normal'],
  weight: ['400', '500'],
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-real',
  weight: ['400', '500'],
});
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  preload: false,
});
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
  preload: false,
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  preload: false,
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  preload: false,
});
const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
  preload: false,
});

const fontVariables = [inter, fraunces, jetbrains, dmSans, nunito, spaceGrotesk, playfair, lora]
  .map((f) => f.variable)
  .join(' ');

export const metadata: Metadata = {
  title: 'UdyamFlow — Bookings, branded',
  description: 'A booking platform that adapts to doctors, tutors, courts, salons.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
