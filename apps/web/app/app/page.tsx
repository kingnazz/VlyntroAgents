import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Console from '../../src/console';
import { sessionStatus } from '../../src/session';
export const metadata: Metadata = {
  title: 'Vlyntro Agent HQ',
  description: 'Private agent operations workspace for Vlyntro.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Page() {
  const status = await sessionStatus();
  if (status === 'anonymous') redirect('/login');
  if (status === 'unavailable') {
    return (
      <main className="unavailable">
        <h1>Agent HQ is reconnecting</h1>
        <p>The API is unavailable. Try again in a moment.</p>
        <a href="/app">Retry connection</a>
      </main>
    );
  }
  return <Console />;
}
