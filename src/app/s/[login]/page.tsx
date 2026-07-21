import type { Metadata } from "next";
import { MonolithApp } from "@/components/MonolithApp";
import { LOGIN_RE, availableYears } from "@/lib/github";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ year?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { login } = await params;
  const { year } = await searchParams;
  const years = availableYears(7);
  const parsed = Number(year);
  const chosen = years.includes(parsed) ? parsed : years[0];
  const description = `${login}'s ${chosen} GitHub contributions as a 3D printable object. Free 3MF, STL and a slicer preset.`;
  return {
    title: login,
    description,
    alternates: { canonical: `/s/${login}?year=${chosen}` },
    openGraph: {
      type: "profile",
      title: `${login} — ${chosen}`,
      description,
      url: `/s/${login}?year=${chosen}`,
    },
    twitter: { card: "summary_large_image", title: `${login} — ${chosen}`, description },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const { login } = await params;
  const { year } = await searchParams;
  if (!LOGIN_RE.test(login)) notFound();
  const years = availableYears(7);
  const parsed = Number(year);
  const chosen = years.includes(parsed) ? parsed : years[0];
  return <MonolithApp initialLogin={login} initialYear={chosen} />;
}
