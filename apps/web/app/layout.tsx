import type { Metadata, Viewport } from 'next';
import { manrope, parkinsans } from '../src/brand/fonts';
import './globals.css';
export const metadata: Metadata = {
  title: 'Vlyntro Agent HQ',
  description: 'Private agent operations workspace for Vlyntro.',
  applicationName: 'Vlyntro Agent HQ',
  icons: { icon: '/icon.svg', apple: '/apple-icon' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: '#FAF6F0',
  colorScheme: 'light',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${parkinsans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
