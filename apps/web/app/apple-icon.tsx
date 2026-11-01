import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Full-bleed so iOS can round the corners itself.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#2A2A2A',
      }}
    >
      <svg width="180" height="180" viewBox="0 0 64 64">
        <rect x="17" y="20" width="9" height="15" rx="4.5" fill="#FAF6F0" />
        <rect x="38" y="20" width="9" height="15" rx="4.5" fill="#FAF6F0" />
        <path
          d="M26 43l6 6 6-6"
          fill="none"
          stroke="#F2C94C"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    size,
  );
}
