import type { MetadataRoute } from "next";
import { PROJECT } from "@/lib/project";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Generated files and private pages are worthless to an index and
        // expensive to crawl: every hit builds a mesh.
        disallow: ["/api/", "/studio", "/order/"],
      },
    ],
    sitemap: `${PROJECT.site}/sitemap.xml`,
    host: PROJECT.site,
  };
}
