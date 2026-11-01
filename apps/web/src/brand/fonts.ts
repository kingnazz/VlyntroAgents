import localFont from 'next/font/local';
export const manrope = localFont({
  src: './fonts/manrope-latin.woff2',
  weight: '200 800',
  variable: '--font-manrope',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});
export const parkinsans = localFont({
  src: './fonts/parkinsans-latin.woff2',
  weight: '300 800',
  variable: '--font-vx-display',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});
