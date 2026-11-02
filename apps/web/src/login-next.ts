export function safeLoginNext(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return '/app';
  const url = new URL(value, 'https://local.invalid');
  if (
    url.origin !== 'https://local.invalid' ||
    !['/app', '/connect', '/connect/authorize'].includes(url.pathname)
  )
    return '/app';
  return url.pathname + url.search;
}
