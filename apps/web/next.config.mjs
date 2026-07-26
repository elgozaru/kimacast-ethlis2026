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

    // ox's tempo/internal/virtualMasterPool.js (pulled in transitively via
    // @privy-io/react-auth -> @walletconnect/ethereum-provider ->
    // @reown/appkit -> viem's experimental "tempo"/"tempoDevnet" chains,
    // none of which this app uses — we only use Privy's embedded wallet)
    // does a dynamic require() webpack can't statically analyze. It's
    // harmless: that code path never runs since we never touch the tempo
    // chains or WalletConnect's external-wallet flow. Silenced here rather
    // than left as recurring noise in the terminal on every compile.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /ox[\\/]_esm[\\/]tempo[\\/]internal[\\/]virtualMasterPool\.js/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    return config;
  },
};

export default nextConfig;
