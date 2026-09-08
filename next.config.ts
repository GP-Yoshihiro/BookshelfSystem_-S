import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // 楽天ブックスAPIが返す書影画像ホストを許可する
    remotePatterns: [
      { protocol: 'https', hostname: 'thumbnail.image.rakuten.co.jp' },
      { protocol: 'https', hostname: 'shop.r10s.jp' },
      { protocol: 'https', hostname: 'image.rakuten.co.jp' },
    ],
  },
};

export default nextConfig;
