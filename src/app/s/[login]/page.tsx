import type { Metadata } from "next";
import { MonolithApp } from "@/components/MonolithApp";
import { LOGIN_RE, clampSelectableYear } from "@/lib/contributions";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ year?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { login } = await params;
  const { year } = await searchParams;
  const chosen = clampSelectableYear(year);
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
  const { year } = await searchParams;
  if (!LOGIN_RE.test(login)) notFound();
  const chosen = clampSelectableYear(year);
  return <MonolithApp initialLogin={login} initialYear={chosen} />;
}
