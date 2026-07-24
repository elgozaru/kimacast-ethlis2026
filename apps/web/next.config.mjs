/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // @hiero-ledger/sdk ships a browser build (grpc-web) but some of its
    // transitive deps still reference Node built-ins. If you hit a
    // "Module not found: Can't resolve 'net'/'tls'/'fs'" error building the
    // client bundle, this is where to extend the fallback map.
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    }
    return config;
  },
};

export default nextConfig;
