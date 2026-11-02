import { cookies } from 'next/headers';

// A cookie alone never authorizes access. The existing API validates the session.
export async function sessionStatus(): Promise<
  'authenticated' | 'anonymous' | 'unavailable'
> {
  const cookie = (await cookies()).get('hq_session');
  if (!cookie) return 'anonymous';
  try {
    const response = await fetch(
      (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000') +
        '/api/v1/auth/me',
      {
        headers: { cookie: 'hq_session=' + cookie.value },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.ok) return 'authenticated';
    return response.status === 401 ? 'anonymous' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
