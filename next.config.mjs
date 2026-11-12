/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // loadRivalConfig() reads the file RIVAL_CONFIG_PATH names at request time. File tracing
  // only sees the literal default path, so ship every product config with the server bundle.
  outputFileTracingIncludes: {
    "/*": ["./rivals.config*.json"]
  }
};

export default nextConfig;
