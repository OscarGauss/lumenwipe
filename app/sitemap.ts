import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${APP_URL}/mainnet`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${APP_URL}/testnet`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
