import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
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

export const metadata: Metadata = {
  title: "MONOLITH — your commit year as an object",
  description:
    "Turn a GitHub year into a printable 3D object. Type a handle, watch it build, take the STL, or order it cast.",
  openGraph: {
    title: "MONOLITH",
    description: "Your commit year, cast as an object.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#060708",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrains.variable} ${grotesk.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
