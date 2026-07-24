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
  const sp = await searchParams;
  const chosen = clampSelectableYear(typeof sp.year === "string" ? sp.year : undefined);
  const description = `${login}'s ${chosen} GitHub contributions as a 3D printable object. Free 3MF, STL and a slicer preset.`;
  // The OG image speaks the whole share contract, so a lifetime or range
  // link unfurls as the window it shows. `noog` opts the page out.
  const req = parseModelRequest(
    new URL(`http://localhost/?${new URLSearchParams(sp as Record<string, string>)}`),
  );
  const ogParams = new URLSearchParams({ login, year: String(chosen) });
  if (req.subject === "repo") {
    ogParams.set("subject", "repo");
    ogParams.set("owner", req.repoOwner);
    ogParams.set("repo", req.repoName);
  } else if (req.span !== "year") {
    ogParams.set("span", req.span);
    if (req.from) ogParams.set("from", req.from);
    if (req.to) ogParams.set("to", req.to);
  }
  if (req.flags.includes("sigil") && req.sign) ogParams.set("sign", req.sign);
  const image = req.flags.includes("noog") ? undefined : [`/api/og?${ogParams}`];
  return {
    title: login,
    description,
    alternates: { canonical: `/s/${login}?year=${chosen}` },
    openGraph: {
      type: "profile",
      title: login,
      description: `${login}'s GitHub contributions as a 3D printable object. Free 3MF, STL and a slicer preset.`,
      url: `/s/${login}?year=${chosen}`,
      images: image,
    },
    twitter: {
      card: "summary_large_image",
      title: login,
      description: `${login}'s GitHub contributions as a 3D printable object.`,
      images: image,
    },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const { login } = await params;
  const sp = await searchParams;
  if (!LOGIN_RE.test(login)) notFound();
  const chosen = clampSelectableYear(typeof sp.year === "string" ? sp.year : undefined);
  // F3/M13: the share link carries the full configuration, so a deep link
  // opens the object exactly as it was shared rather than at the defaults.
  // Everything the parser validated is forwarded: variant, size, dampening,
  // palette, span (lifetime/range) and subject (repo skyline) included.
  const req = parseModelRequest(new URL(`http://localhost/?${new URLSearchParams(sp as Record<string, string>)}`));
  return (
    <MonolithApp
      initialLogin={login}
      initialYear={chosen}
      initialPaletteId={req.paletteId}
      initialVariant={req.variant}
      initialSizeMm={req.sizeMm}
      initialDampening={req.dampening}
      initialSpan={req.span}
      initialFrom={req.from}
      initialTo={req.to}
      initialSubject={req.subject}
      initialRepoOwner={req.repoOwner}
      initialRepoName={req.repoName}
      initialFlags={req.flags}
    />
  );
}
