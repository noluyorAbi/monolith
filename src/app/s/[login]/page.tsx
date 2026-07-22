import type { Metadata } from "next";
import { MonolithApp } from "@/components/MonolithApp";
import { LOGIN_RE, clampSelectableYear } from "@/lib/contributions";
import { parseModelRequest } from "@/lib/request";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { login } = await params;
  const { year } = await searchParams;
  const chosen = clampSelectableYear(typeof year === "string" ? year : undefined);
  const description = `${login}'s ${chosen} GitHub contributions as a 3D printable object. Free 3MF, STL and a slicer preset.`;
  return {
    title: login,
    description,
    alternates: { canonical: `/s/${login}?year=${chosen}` },
    // The share card is generated from a route that only receives the path
    // segment, so it can never honour ?year=. Neither promises a year the
    // other cannot show.
    openGraph: {
      type: "profile",
      title: login,
      description: `${login}'s GitHub contributions as a 3D printable object. Free 3MF, STL and a slicer preset.`,
      url: `/s/${login}?year=${chosen}`,
    },
    twitter: {
      card: "summary_large_image",
      title: login,
      description: `${login}'s GitHub contributions as a 3D printable object.`,
    },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const { login } = await params;
  const sp = await searchParams;
  if (!LOGIN_RE.test(login)) notFound();
  const chosen = clampSelectableYear(typeof sp.year === "string" ? sp.year : undefined);
  // F3: the share link carries the full configuration, so a deep link opens
  // the object exactly as it was shared rather than at the defaults.
  const req = parseModelRequest(new URL(`http://localhost/?${new URLSearchParams(sp as Record<string, string>)}`));
  return (
    <MonolithApp
      initialLogin={login}
      initialYear={chosen}
      initialPaletteId={req.paletteId}
    />
  );
}
