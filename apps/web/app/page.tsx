import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Console from '../src/console';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const cookie = (await cookies()).get('hq_session');
  if (!cookie) redirect('/login');
  try {
    const response = await fetch(
      (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000') +
        '/api/v1/auth/me',
      { headers: { cookie: 'hq_session=' + cookie.value }, cache: 'no-store' },
    );
    if (!response.ok) redirect('/login');
  } catch (error) {
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT'))
      throw error;
    return (
      <main className="unavailable">
        <h1>Agent HQ is reconnecting</h1>
        <p>The API is unavailable. Try again in a moment.</p>
        <a href="/">Retry connection</a>
      </main>
    );
  }
  return <Console />;
}
