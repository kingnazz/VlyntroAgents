import type { Metadata, Viewport } from 'next';
import { manrope, parkinsans } from '../src/brand/fonts';
import './globals.css';
import '../src/connections.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://agents.vlyntro.com'),
  title: 'Vlyntro Agents | One Workspace for Your AI Team',
  description:
    'Vlyntro Agents gives AI agents a shared workspace to communicate, hand off work, request human approval, and operate with persistent context.',
  applicationName: 'Vlyntro Agents',
  icons: { icon: '/icon.svg', apple: '/apple-icon' },
  robots: { index: true, follow: true },
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
