import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { PROJECT } from "@/lib/project";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

const DESCRIPTION =
  "Turn a GitHub contribution year into a 3D printable object. Free 3MF, STL and a Bambu Studio and OrcaSlicer preset. No account, no upload, no sign-up.";

export const metadata: Metadata = {
  metadataBase: new URL(PROJECT.site),
  title: {
    default: `${PROJECT.name} — ${PROJECT.tagline}`,
    template: `%s — ${PROJECT.name}`,
  },
  description: DESCRIPTION,
  applicationName: PROJECT.name,
  authors: [{ name: PROJECT.author, url: PROJECT.url }],
  creator: PROJECT.author,
  publisher: PROJECT.author,
  // Written for the queries people actually type when they want this thing,
  // not stuffed. Keywords carry little weight for search engines now but are
  // still read by some answer engines and by link unfurlers.
  keywords: [
    "GitHub skyline",
    "GitHub contribution graph 3D",
    "3D printable GitHub contributions",
    "GitHub year 3D model",
    "contribution graph STL",
    "GitHub skyline 3MF",
    "Bambu Studio preset",
    "OrcaSlicer profile",
    "commit history 3D print",
    "developer desk trophy",
    "open source GitHub skyline generator",
    "GitHub contributions to STL",
  ],
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: PROJECT.name,
    title: `${PROJECT.name} — ${PROJECT.tagline}`,
    description: DESCRIPTION,
    url: PROJECT.site,
    locale: "en",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "A GitHub contribution year projected as a 3D printable object",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PROJECT.name} — ${PROJECT.tagline}`,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  other: {
    "license": PROJECT.licence,
  },
};

/**
 * Structured data. A SoftwareApplication that is free, plus the WebSite entry
 * that lets an answer engine cite the thing rather than describe it.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: PROJECT.name,
      applicationCategory: "DesignApplication",
      operatingSystem: "Any",
      url: PROJECT.site,
      description: DESCRIPTION,
      license: `${PROJECT.url}/blob/main/LICENSE`,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      author: { "@type": "Person", name: PROJECT.author, url: PROJECT.url },
      codeRepository: PROJECT.url,
      featureList: [
        "Reads any public GitHub contribution year",
        "Four object forms: skyline, ring, wave, spine",
        "Exports 3MF split by contribution intensity",
        "Exports binary STL from 60 to 400 mm",
        "Ships a Bambu Studio and OrcaSlicer process preset",
      ],
    },
    {
      "@type": "WebSite",
      name: PROJECT.name,
      url: PROJECT.site,
      description: DESCRIPTION,
      inLanguage: "en",
    },
  ],
};

export const viewport: Viewport = {
  themeColor: "#060708",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrains.variable} ${grotesk.variable}`}>
      <body className="antialiased">
        <script
          type="application/ld+json"
          // Generated from a literal above, so there is no user input in it.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {children}
      </body>
    </html>
  );
}
