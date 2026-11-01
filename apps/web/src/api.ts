export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('Session expired.');
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ?? 'The request could not be completed.',
    );
  return result as T;
}
export const mutation = (body: unknown, method = 'POST') => ({
  method,
  body: JSON.stringify(body),
});
export const time = (date: string) =>
  new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const date = (value: string) =>
  new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
