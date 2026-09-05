import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repositoryBasePath = "/mes-courses-teo";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export" as const,
        basePath: repositoryBasePath,
        assetPrefix: repositoryBasePath,
      }
    : {}),
  images: { unoptimized: true },
};

export default nextConfig;
