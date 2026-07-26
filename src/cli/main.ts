#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDuel, buildMonolith, buildMultiYear } from "@/lib/build";
import { BadLoginError, NotFoundError, computeStats } from "@/lib/contributions";
import { buildOptionsFrom } from "@/lib/extras";
import { fetchModelLanguages, resolveModelSource } from "@/lib/github";
import { bambuPreset, buildKit, buildKitThreeMf, kitStem, presetName, printCard } from "@/lib/kit";
import { printableParts } from "@/lib/parts";
import { PROJECT } from "@/lib/project";
import { parseModelRequest } from "@/lib/request";
import { toBinarySTL } from "@/lib/stl";

/**
 * The print kit, without a browser.
 *
 * The website is the product; this exists because the people most likely to
 * own a printer already live in a terminal, and because the one competitor in
 * this niche that ships a CLI exports binary STL only, with no 3MF, no colour
 * split and no slicer profile.
 *
 * It is deliberately thin. Arguments are folded into the same query string the
 * download routes parse, so `parseModelRequest` applies one set of defaults,
 * clamps and flag rules to both surfaces. A CLI with its own idea of what
 * `--mm 9999` means would be a second product to keep in step.
 */

const USAGE = `monolith - a GitHub contribution year as a printable object

  monolith <handle> [options]

Options
  --year <n>          calendar year, default the most recent with data
  --variant <id>      skyline | ring | wave | spine        (default skyline)
  --mm <n>            60 to 400                            (default 180)
  --printer <id>      x1c | p1s | a1 | a1m                 (default a1)
  --material <id>     pla | pla-matte | pla-silk | petg    (default pla)
  --quality <id>      fine | standard | fast               (default standard)
  --slots <n>         filament slots the printer has       (default 1)
  --palette <id>      signal | obsidian | bone | titanium
  --span <id>         year | lifetime                      (default year)
  --flags <list>      sigil,peak,loop,langs
  --vs <handle>       two accounts back to back on one plate
  --repo <owner/name> one repository's commits instead of an account
  --out <dir>         where to write                       (default ./monolith)
  --zip               write one .zip instead of loose files
  --json              print the year's statistics, build nothing
  -h, --help

Examples
  monolith octocat
  monolith octocat --variant ring --mm 260 --printer p1s --flags sigil,langs
  monolith octocat --span lifetime --out ~/Desktop

No account, no token, no upload. Without GITHUB_TOKEN it reads the public
contribution calendar, which is the same numbers and GitHub's own rate limit.
`;

interface Parsed {
  handle: string;
  out: string;
  zip: boolean;
  json: boolean;
  query: URLSearchParams;
}

/** Flags that take a value, mapped to the query key the web contract uses. */
const VALUE_FLAGS: Record<string, string> = {
  year: "year",
  variant: "variant",
  mm: "mm",
  printer: "printer",
  material: "material",
  quality: "quality",
  slots: "slots",
  palette: "palette",
  span: "span",
  from: "from",
  to: "to",
  flags: "flags",
  sign: "sign",
  vs: "vs",
  dampening: "dampening",
};

/** Distinguishes "they asked for help" from "they gave us nothing usable". */
const HELP = Symbol("help");

function parseArgs(argv: string[]): Parsed | typeof HELP | null {
  const query = new URLSearchParams();
  let handle = "";
  let out = "monolith";
  let zip = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return HELP;
    if (arg === "--zip") {
      zip = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--out") {
      out = argv[++i] ?? out;
      continue;
    }
    if (arg === "--repo") {
      // Accepted in the shape people paste, then split into the two keys the
      // contract wants. An unparseable value falls through to the account
      // path rather than erroring, which is what the web does too.
      const value = argv[++i] ?? "";
      const [owner, name] = value.replace(/^https?:\/\/github\.com\//, "").split("/");
      if (owner && name) {
        query.set("subject", "repo");
        query.set("owner", owner);
        query.set("repo", name);
      }
      continue;
    }
    if (arg.startsWith("--")) {
      const key = VALUE_FLAGS[arg.slice(2)];
      if (!key) {
        process.stderr.write(`unknown option ${arg}\n\n${USAGE}`);
        process.exit(2);
      }
      const value = argv[++i];
      if (value === undefined) {
        process.stderr.write(`${arg} needs a value\n`);
        process.exit(2);
      }
      query.set(key, value);
      continue;
    }
    if (!handle) handle = arg;
  }

  if (!handle) return null;
  query.set("login", handle);
  return { handle, out, zip, json, query };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === HELP) {
    process.stdout.write(USAGE);
    return;
  }
  if (parsed === null) {
    // No handle. Usage on stderr and a non-zero exit, so a script that forgot
    // to pass one fails instead of looking like it succeeded.
    process.stderr.write(USAGE);
    process.exit(1);
  }

  // One contract for both surfaces: the same parser the HTTP routes use.
  const options = parseModelRequest(new URL(`https://cli/?${parsed.query}`));

  const [src, langs] = await Promise.all([
    resolveModelSource(options),
    options.flags.includes("langs") ? fetchModelLanguages(options) : null,
  ]);

  if (parsed.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          login: src.who,
          year: src.data.year,
          span: src.spanLabel,
          total: src.data.total,
          sampleData: src.demo,
          stats: computeStats(src.data),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const build = buildOptionsFrom(options, src, langs);
  const mesh = src.vsData
    ? buildDuel(src.data, src.vsData, build)
    : src.multi
      ? buildMultiYear(src.multi, build)
      : buildMonolith(src.data, build);
  const parts = printableParts(mesh);

  const kitOptions = {
    ...options,
    login: src.who,
    year: src.data.year,
    spanLabel: src.spanLabel,
    sourceUrl: PROJECT.url,
    modelLicence: PROJECT.modelLicence,
    sampleData: src.demo,
  };
  const stem = kitStem(kitOptions);
  const dir = path.resolve(parsed.out);
  await mkdir(dir, { recursive: true });

  const written: string[] = [];
  const write = async (rel: string, data: Uint8Array | string) => {
    const target = path.join(dir, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    written.push(rel);
  };

  if (parsed.zip) {
    await write(`${stem}-print-kit.zip`, new Uint8Array(buildKit(parts, mesh, kitOptions)));
  } else {
    // Loose files by default. A CLI user has a filesystem; handing them a zip
    // to unpack is a step the browser needed and the terminal does not.
    await write(`${stem}.3mf`, new Uint8Array(buildKitThreeMf(parts, mesh, kitOptions)));
    await write(
      `${stem}.stl`,
      new Uint8Array(toBinarySTL(mesh, `MONOLITH ${src.who} ${src.data.year} ${options.variant}`)),
    );
    await write(`presets/${presetName(options.printer, options.quality)}.json`, bambuPreset(kitOptions));
    await write("PRINT-ME.txt", printCard(parts, mesh, kitOptions));
  }

  if (src.demo) {
    // Someone is about to spend hours and filament on this. A fabricated year
    // has to be louder than a log line.
    process.stderr.write(
      "\n  WARNING: GitHub could not be reached, so this is SAMPLE DATA, not that account's real year.\n\n",
    );
  }
  process.stdout.write(
    `${src.who} ${src.spanLabel}, ${options.variant}, ${options.sizeMm}mm, ${parts.length} parts\n` +
      written.map((f) => `  ${path.join(parsed.out, f)}\n`).join(""),
  );
}

main().catch((error: unknown) => {
  // The three failures a user can actually cause get a sentence. Everything
  // else keeps its stack, because it is a bug in here rather than in the input.
  if (error instanceof BadLoginError) {
    process.stderr.write("that is not a valid GitHub handle\n");
    process.exit(2);
  }
  if (error instanceof NotFoundError) {
    process.stderr.write("no such account, or it has no public contributions\n");
    process.exit(2);
  }
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
