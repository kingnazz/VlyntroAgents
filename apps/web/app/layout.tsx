import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Vlyntro Agent HQ',
  description: 'Private workspace for Vlyntro agents and operators',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
