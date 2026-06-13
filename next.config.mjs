/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the container
  // image used by Dokploy stays small and runs without the full node_modules
  // tree. `next start` is replaced by `node server.js` in production.
  output: "standalone",
  // The mainnet network used to live at /public (Stellar's network name).
  // It's now /mainnet to match the UI label; keep old links working.
  async redirects() {
    return [
      { source: "/public", destination: "/mainnet", permanent: true },
      { source: "/public/:path*", destination: "/mainnet/:path*", permanent: true },
    ];
  },
  // Prevent webpack from trying to bundle native Node.js addons pulled in by
  // @stellar/stellar-sdk (sodium-native, require-addon) when building the
  // server bundle. Node.js loads them natively; only the browser bundle needs
  // the fallback below.
  serverExternalPackages: ["sodium-native", "require-addon"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Replace Node.js-only modules with empty stubs in the browser bundle.
      // The stellar-sdk falls back to its pure-JS crypto (tweetnacl) when
      // sodium-native is absent.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        "sodium-native": false,
        "require-addon": false,
      };
    }
    return config;
  },
};

export default nextConfig;
