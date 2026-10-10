/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Runtime records and credentials must never become deployment artifacts.
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./.runtime/**/*", "./work/**/*", "./.env*"] },
};

export default nextConfig;
