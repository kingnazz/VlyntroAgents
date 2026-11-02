import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/login', '/connect', '/oauth/', '/api/', '/mcp'],
    },
    sitemap: 'https://agents.vlyntro.com/sitemap.xml',
  };
}
