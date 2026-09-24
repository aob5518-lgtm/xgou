import type { NextConfig } from 'next';

interface WebpackConfiguration {
  readonly resolve: { extensionAlias?: Record<string, string[]> };
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config: WebpackConfiguration) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
