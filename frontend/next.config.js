// Check if building for GitHub Pages
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Static export for GitHub Pages
  output: 'export',

  // Base path for GitHub Pages (repo name)
  basePath: isGitHubPages ? '/AMANTRA' : '',
  assetPrefix: isGitHubPages ? '/AMANTRA/' : '',

  // Trailing slash for static hosting
  trailingSlash: true,

  images: {
    domains: ['gateway.pinata.cloud', 'ipfs.io'],
    // Required for static export
    unoptimized: true,
  },
};

module.exports = nextConfig;
