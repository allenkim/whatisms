import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/finance",
  env: { NEXT_PUBLIC_BASE_PATH: "/finance" },
};

export default nextConfig;
