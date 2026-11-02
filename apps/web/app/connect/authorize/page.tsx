import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sessionStatus } from '../../../src/session';
import { ConnectionConsent } from '../../../src/connection-consent';
export const metadata: Metadata = {
  title: 'Connect your AI | Vlyntro Agents',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ request?: string | string[] }>;
}) {
  const request = (await searchParams).request;
  if (typeof request !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(request))
    return (
      <main className="unavailable">
        <h1>Invalid connection request</h1>
        <p>Start again from your AI app.</p>
        <a href="/connect">Connection setup</a>
      </main>
    );
  const status = await sessionStatus();
  if (status === 'anonymous')
    redirect(
      '/login?next=' +
        encodeURIComponent('/connect/authorize?request=' + request),
    );
  if (status === 'unavailable')
    return (
      <main className="unavailable">
        <h1>Agent HQ is reconnecting</h1>
        <p>Please reload this page in a moment.</p>
      </main>
    );
  return <ConnectionConsent request={request} />;
}
