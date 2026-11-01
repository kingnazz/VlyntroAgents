import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BrandFace } from '../src/brand/BrandFace';
export const alt = 'Vlyntro Agents. Your AI team, in one place.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default async function Image() {
  const [display, body] = await Promise.all([
    readFile(path.join(process.cwd(), 'src/brand/fonts/parkinsans-og.ttf')),
    readFile(path.join(process.cwd(), 'src/brand/fonts/manrope-og.ttf')),
  ]);
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#FAF6F0',
        color: '#2A2A2A',
        fontFamily: 'Manrope',
        padding: 65,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontSize: 26,
          fontWeight: 700,
          fontFamily: 'Parkinsans',
        }}
      >
        <BrandFace size={48} />
        VLYNTRO
        <span
          style={{
            fontSize: 18,
            paddingLeft: 20,
            borderLeft: '1px solid #bdb7ae',
            letterSpacing: 4,
          }}
        >
          AGENTS
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 88,
          fontFamily: 'Parkinsans',
          lineHeight: 1.04,
          letterSpacing: -5,
          fontWeight: 700,
        }}
      >
        <span>Your AI team,</span>
        <span>
          in one place<span style={{ color: '#E07856' }}>.</span>
        </span>
      </div>
      <div
        style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 21 }}
      >
        <span
          style={{
            padding: '11px 18px',
            background: '#E1EDF3',
            borderRadius: 12,
          }}
        >
          Shared context
        </span>
        <span
          style={{
            padding: '11px 18px',
            background: '#FBF0CC',
            borderRadius: 12,
          }}
        >
          Human approvals
        </span>
        <span
          style={{
            padding: '11px 18px',
            background: '#E6ECDD',
            borderRadius: 12,
          }}
        >
          Clear handoffs
        </span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: 'Parkinsans',
          data: new Uint8Array(display).buffer,
          weight: 700,
          style: 'normal',
        },
        {
          name: 'Manrope',
          data: new Uint8Array(body).buffer,
          weight: 500,
          style: 'normal',
        },
      ],
    },
  );
}
