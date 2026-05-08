import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpack = require("webpack");

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer"),
        fs: false,
        os: false,
        path: false,
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        })
      );
    }
    // Suppress noisy warnings from WalletConnect transitive deps
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      /Critical dependency.*the request of a dependency is an expression/,
      /Module not found.*pino-pretty/,
    ];

    return config;
  },
};

export default nextConfig;
