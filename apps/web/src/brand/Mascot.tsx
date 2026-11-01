'use client';

import { useEffect, useRef } from 'react';

type MascotProps = {
  /** Rendered width in px. Height follows the artwork's aspect ratio. Omit to size it from CSS. */
  size?: number;
  mood?: 'idle' | 'happy' | 'think';
  /** Eyes follow the pointer while the mascot is on screen. */
  track?: boolean;
  /** Where the eyes rest before the pointer moves, in artwork units (about -4..4). */
  rest?: { x: number; y: number };
  bubble?: string | null;
  /** Short line shown while the mascot itself is hovered. */
  hoverLine?: string;
  /** Line shown while a `.vx-happy-source` inside the surrounding `.vx-happy-scope` is hovered or focused. */
  cheerLine?: string;
  bubbleSide?: 'left' | 'right';
  className?: string;
  blinkDelay?: number;
};

export function Mascot({
  size,
  mood = 'idle',
  track = true,
  rest = { x: 0, y: 0 },
  bubble,
  hoverLine,
  cheerLine,
  bubbleSide = 'left',
  className = '',
  blinkDelay = 0,
}: MascotProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let visible = false;

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(element);

    const update = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const dx = pointerX - (box.left + box.width / 2);
      const dy = pointerY - (box.top + box.height * 0.45);
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, distance / 260);
      element.style.setProperty(
        '--eye-x',
        `${((dx / distance) * reach * 4.5).toFixed(2)}px`,
      );
      element.style.setProperty(
        '--eye-y',
        `${((dy / distance) * reach * 3.5).toFixed(2)}px`,
      );
    };

    const onMove = (event: PointerEvent) => {
      if (!visible || event.pointerType === 'touch') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [track]);

  return (
    <div
      ref={ref}
      className={`vx-mascot ${className}`}
      data-mood={mood}
      data-side={bubbleSide}
      aria-hidden="true"
      style={
        {
          width: size,
          '--eye-x': `${rest.x}px`,
          '--eye-y': `${rest.y}px`,
          '--blink-delay': `${blinkDelay}s`,
        } as React.CSSProperties
      }
    >
      {bubble ? (
        <span
          className="vx-bubble vx-bubble-main"
          data-show={bubble ? 'true' : 'false'}
        >
          {bubble}
        </span>
      ) : null}
      {hoverLine ? (
        <span className="vx-bubble vx-bubble-hover">{hoverLine}</span>
      ) : null}
      {cheerLine ? (
        <span className="vx-bubble vx-bubble-cheer">{cheerLine}</span>
      ) : null}
      <svg viewBox="0 0 120 128" focusable="false">
        <ellipse className="vx-m-shadow" cx="60" cy="122" rx="30" ry="4" />
        <g className="vx-m-body">
          <g className="vx-m-tilt">
            <path
              d="M60 24V11"
              stroke="#2A2A2A"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle className="vx-m-light" cx="60" cy="8.5" r="5.5" />
            <rect x="7" y="52" width="9" height="22" rx="4.5" fill="#8FBCD4" />
            <rect
              x="104"
              y="52"
              width="9"
              height="22"
              rx="4.5"
              fill="#8FBCD4"
            />
            <rect x="14" y="22" width="92" height="86" rx="32" fill="#2A2A2A" />
            <g className="vx-m-look">
              <g className="vx-m-eyes">
                <rect
                  x="38"
                  y="47"
                  width="13"
                  height="22"
                  rx="6.5"
                  fill="#FAF6F0"
                />
                <rect
                  x="69"
                  y="47"
                  width="13"
                  height="22"
                  rx="6.5"
                  fill="#FAF6F0"
                />
              </g>
              <g
                className="vx-m-happy"
                fill="none"
                stroke="#FAF6F0"
                strokeWidth="4.5"
                strokeLinecap="round"
              >
                <path d="M37 62q7.5-11 15 0" />
                <path d="M68 62q7.5-11 15 0" />
              </g>
              <path
                className="vx-m-mouth"
                d="M53 82.5 60 89l7-6.5"
                fill="none"
                stroke="#F2C94C"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
