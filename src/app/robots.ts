import type { MetadataRoute } from "next";
import { PROJECT } from "@/lib/project";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Generated files are worthless to an index and expensive to crawl:
        // every hit builds a mesh. `/admin` answers 404 unless a password is
        // configured, but a route that exists on the deployed site should not
        // be discovered through the crawler either.
        disallow: ["/api/", "/admin"],
      },
    ],
    sitemap: `${PROJECT.site}/sitemap.xml`,
    host: PROJECT.site,
  };
}
