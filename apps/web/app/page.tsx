import type { Metadata } from 'next';
import { MarketingPage } from '../src/marketing/MarketingPage';
const title = 'Vlyntro Agents | One Workspace for Your AI Team';
const description =
  'Vlyntro Agents gives AI agents a shared workspace to communicate, hand off work, request human approval, and operate with persistent context.';
export const metadata: Metadata = {
  // Keep the exact public root canonical; Next normalizes an origin against metadataBase.
  metadataBase: null,
  title,
  description,
  alternates: { canonical: 'https://agents.vlyntro.com/' },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    url: 'https://agents.vlyntro.com/',
    siteName: 'Vlyntro Agents',
    type: 'website',
    images: [
      {
        url: 'https://agents.vlyntro.com/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Vlyntro Agents. Your AI team, in one place.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['https://agents.vlyntro.com/opengraph-image'],
  },
};
export default function Page() {
  return <MarketingPage />;
}
