import type { Metadata } from "next";
import { MonolithApp } from "@/components/MonolithApp";
import { LOGIN_RE, availableYears } from "@/lib/github";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ year?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { login } = await params;
  return {
    title: `${login} — MONOLITH`,
    description: `${login}'s GitHub year, cast as a printable object.`,
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
