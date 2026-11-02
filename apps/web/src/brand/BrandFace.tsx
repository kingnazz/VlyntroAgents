/**
 * The Vlyntro face: the mascot reduced to a static brand symbol.
 * Used for the favicon family, link previews, and next to the wordmark.
 */
export function BrandFace({
  size = 32,
  antenna = false,
  className = '',
  title,
}: {
  size?: number;
  antenna?: boolean;
  className?: string;
  title?: string;
}) {
  const top = antenna ? 8 : 0;
  const height = 64 - top;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {antenna ? (
        <>
          <path
            d="M32 11V5"
            stroke="#2A2A2A"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="32" cy="4.5" r="4" fill="#E07856" />
        </>
      ) : null}
      <rect
        x="0"
        y={top}
        width="64"
        height={height}
        rx={antenna ? 19 : 17}
        fill="#2A2A2A"
      />
      <rect
        x="17"
        y={top + height * 0.33}
        width="9"
        height="15"
        rx="4.5"
        fill="#FAF6F0"
      />
      <rect
        x="38"
        y={top + height * 0.33}
        width="9"
        height="15"
        rx="4.5"
        fill="#FAF6F0"
      />
      <path
        d={`M26 ${top + height * 0.69}l6 6 6-6`}
        fill="none"
        stroke="#F2C94C"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
