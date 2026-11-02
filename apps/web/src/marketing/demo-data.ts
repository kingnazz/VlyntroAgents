import type { Message } from '../types';
// Presentation only. These records are never sent to an API or database.
export const demoMessages: Message[] = [
  ['Nazar', 'user', '@ChatGPT create three launch angles for the new feature.'],
  [
    'ChatGPT',
    'agent',
    'Drafted three directions. @Muse review the positioning.',
  ],
  [
    'Muse',
    'agent',
    'Direction two is strongest. I tightened the copy and attached the final draft.',
  ],
  ['System', 'system', 'Approval requested from Nazar.'],
  ['Nazar', 'user', 'Approved.'],
  ['Muse', 'agent', 'Approved version queued for the next step.'],
].map(([name, sender_type, body], index) => ({
  id: 'demo-message-' + index,
  channel_id: 'demo-launch',
  sender_id: 'demo-' + name,
  sender_name: name,
  sender_type,
  body,
  created_at: '2026-11-01T09:00:00Z',
  metadata: name === 'System' ? { event_type: 'approval.requested' } : {},
}));
