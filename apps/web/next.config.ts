import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lgcxydabfbch3774324.cdn.ntruss.com' },
      { protocol: 'https', hostname: 'www.koreabaseball.com' },
    ],
  },
}

export default nextConfig
