/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@medidata/shared'],
  webpack: (config) => {
    // @medidata/shared is TS ESM that imports sibling files with explicit
    // ".js" extensions (NodeNext style) — teach webpack to try ".ts" too.
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    };
    return config;
  },
};

export default nextConfig;
