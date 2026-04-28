import type { Metadata } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

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

export const metadata: Metadata = {
  title: 'UdyamFlow — Bookings, branded',
  description: 'A booking platform that adapts to doctors, tutors, courts, salons.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
