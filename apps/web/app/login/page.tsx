import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Login from '../../src/login';
import { sessionStatus } from '../../src/session';
export const metadata: Metadata = {
  title: 'Sign In | Vlyntro Agents',
  description: 'Sign in to your private Agent HQ workspace.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Page() {
  if ((await sessionStatus()) === 'authenticated') redirect('/app');
  return <Login />;
}
