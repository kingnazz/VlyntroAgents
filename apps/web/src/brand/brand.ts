export const brandSource = {
  repository: 'kingnazz/Vlyntro-codex',
  ref: '50e55c2bf1c1a3c54618bee2cb429d5a47c526cb',
} as const;
export const brandColors = {
  paper: '#FAF6F0',
  sand: '#F2ECE2',
  card: '#FFFDF9',
  ink: '#2A2A2A',
  coral: '#E07856',
  sage: '#9CAF88',
  butter: '#F2C94C',
  sky: '#8FBCD4',
} as const;
export type Tone =
  'neutral' | 'human' | 'agent' | 'success' | 'waiting' | 'error';
export function statusTone(status: string): Tone {
  if (['running', 'busy', 'queued', 'claimed', 'in_review'].includes(status))
    return 'agent';
  if (
    ['online', 'healthy', 'completed', 'approved', 'published'].includes(status)
  )
    return 'success';
  if (
    ['pending', 'needs_approval', 'waiting', 'blocked', 'degraded'].includes(
      status,
    )
  )
    return 'waiting';
  if (['failed', 'error', 'rejected'].includes(status)) return 'error';
  return 'neutral';
}
export function agentTone(name: string): Tone {
  if (name.toLowerCase() === 'chatgpt') return 'agent';
  if (name.toLowerCase() === 'muse') return 'human';
  if (name.toLowerCase() === 'grokbot') return 'success';
  if (name.toLowerCase() === 'codex') return 'waiting';
  return 'neutral';
}
