/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8001/api/:path*',
      },
      {
        source: '/data/:path*',
        destination: 'http://localhost:8001/data/:path*',
      },
    ]
  },
}

module.exports = nextConfig

