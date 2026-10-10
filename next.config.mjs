/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/subscribe',
        destination: '/hotspot/login',
        permanent: false,
      },
      {
        source: '/hotspot',
        destination: '/hotspot/login',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/:path*',
          destination: '/api/hotspot/portal-login',
          has: [{ type: 'host', value: 'login.lktech.life' }],
        },
      ],
    }
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
