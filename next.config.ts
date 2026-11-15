import type { NextConfig } from 'next';

const hearthstoneIndex = '/hearthstone/index.html';

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ['pdfjs-dist'],
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: hearthstoneIndex },
        { source: '/search', destination: hearthstoneIndex },
        { source: '/building/:buildingId', destination: hearthstoneIndex },
        { source: '/compare', destination: hearthstoneIndex },
        { source: '/saved', destination: hearthstoneIndex },
        { source: '/account', destination: hearthstoneIndex },
        { source: '/how-it-works', destination: hearthstoneIndex },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; worker-src 'self' blob:; font-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
      ],
    }];
  },
};

export default config;
