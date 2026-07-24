"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Prompt } from "./Prompt";
import { Forge, type ForgeStep } from "./Forge";
import { Hud } from "./Hud";
import { Dock } from "./Dock";
import { PrintSheet } from "./PrintSheet";
import { CursorField } from "./CursorField";
import { Story } from "./Story";
import { PROJECT } from "@/lib/project";
import { SIZES, VARIANTS, buildMonolith, buildMultiYear, sizeById } from "@/lib/build";
import { DEFAULT_PRINTER_ID } from "@/lib/print";
import { SELECTABLE_YEARS, availableYears, availableYearsFor, computeStats, yearFromDays } from "@/lib/contributions";
import { AMBIENT_PALETTE, DEFAULT_PALETTE_ID, PALETTES, paletteById } from "@/lib/palettes";
import {
  play,
  setSoundEnabled,
  soundEnabled,
  soundServerSnapshot,
  subscribeSound,
} from "@/lib/sound";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { modelQuery, type ModelSpan, type ModelSubject } from "@/lib/request";
import type { SizeId } from "@/lib/build";
import type {
  BuiltMesh,
  CommitHoursData,
  ContributionYear,
  Day,
  MultiYearData,
  Stats,
  StudioLights,
  Variant,
} from "@/lib/types";
import frozen from "../../data/contributions-2025.json";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

type Phase = "idle" | "forging" | "live";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The offered size whose millimetres sit closest to a shared link's `mm`. */
function nearestSizeId(mm: number | undefined): SizeId {
  if (!mm) return "shelf";
  let best = SIZES[0];
  for (const s of SIZES) {
    if (Math.abs(s.mm - mm) < Math.abs(best.mm - mm)) best = s;
  }
  return best.id;
}

export function MonolithApp({
  initialLogin,
  initialYear,
  initialPaletteId,
  initialVariant,
  initialSizeMm,
  initialDampening,
  initialSpan,
  initialFrom,
  initialTo,
  initialSubject,
  initialRepoOwner,
  initialRepoName,
}: {
  initialLogin?: string;
  initialYear?: number;
  initialPaletteId?: string;
  initialVariant?: Variant;
  initialSizeMm?: number;
  initialDampening?: number;
  initialSpan?: ModelSpan;
  initialFrom?: string;
  initialTo?: string;
  initialSubject?: ModelSubject;
  initialRepoOwner?: string;
  initialRepoName?: string;
}) {
  const years = useMemo(() => availableYears(SELECTABLE_YEARS), []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [login, setLogin] = useState(initialLogin ?? "");
  const [year, setYear] = useState(initialYear ?? years[0]);
  /**
   * What the object is a picture OF. Either a GitHub user (the default) or a
   * repository, in which case the forge pulls the repo's commit skyline instead
   * of a contribution calendar. M14 / marktanalyse 5.4. Seeded from the share
   * link so a deep link reproduces the shared object, not the default one.
   */
  const [subject, setSubject] = useState<ModelSubject>(initialSubject ?? "user");
  const [repoOwner, setRepoOwner] = useState(initialRepoOwner ?? "");
  const [repoName, setRepoName] = useState(initialRepoName ?? "");
  /**
   * The window to render. `year` is a single calendar year (the original).
   * `lifetime` stacks every year the account has (M12). `range` is an arbitrary
   * from/to window (M11). These drive which endpoint the forge hits.
   */
  const [span, setSpan] = useState<ModelSpan>(initialSpan ?? "year");
  const [rangeFrom, setRangeFrom] = useState(initialFrom || `${years[0]}-01-01`);
  const [rangeTo, setRangeTo] = useState(initialTo || `${new Date().getUTCFullYear()}-12-31`);
  const [variant, setVariant] = useState<Variant>(initialVariant ?? "skyline");
  const [paletteId, setPaletteId] = useState(
    initialPaletteId && PALETTES.some((p) => p.id === initialPaletteId)
      ? initialPaletteId
      : DEFAULT_PALETTE_ID,
  );
  const [sizeId, setSizeId] = useState<SizeId>(nearestSizeId(initialSizeMm));
  const [printerId, setPrinterId] = useState(DEFAULT_PRINTER_ID);
  const [dampening, setDampening] = useState(initialDampening ?? 0);
  const [data, setData] = useState<ContributionYear | null>(null);
  /** A multi-year roll-up (lifetime / several years). Set alongside `data` so
   * the viewer can render it with buildMultiYear. M1 / marktanalyse 5.4. */
  const [multi, setMulti] = useState<MultiYearData | null>(null);
  /** What to print as the object's year line: a number, a range, or "owner/repo". */
  const [yearLabel, setYearLabel] = useState<string>(`${years[0]}`);
  // Once a year is fetched, the picker offers the years that account actually
  // has, instead of a fixed window that would show empty years or hide real
  // ones. The initial list is the recent window so the idle landing still has
  // a year to render. F4.
  const liveYears = useMemo(() => availableYearsFor(data), [data]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [steps, setSteps] = useState<ForgeStep[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [spin, setSpin] = useState(true);
  const sound = useSyncExternalStore(
    subscribeSound,
    soundEnabled,
    soundServerSnapshot,
  );
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  /** M16: the commit time-of-day histogram, fetched once the object is live. */
  const [commitHours, setCommitHours] = useState<CommitHoursData | null>(null);
  /** The studio's light switches, all on until a hand reaches for them. */
  const [studio, setStudio] = useState<StudioLights>({
    key: true,
    fill: true,
    rim: true,
    front: false,
    glow: true,
  });
  /** Whether the object has been taken hold of. The hint is owed until it is. */
  const [turned, setTurned] = useState(false);
  /** Whether the page has been scrolled at all. The cue is owed until it has. */
  const [scrolled, setScrolled] = useState(false);
  /** What the story has told the idle object to be. */
  const [storyVariant, setStoryVariant] = useState<Variant>("skyline");
  const [storyPaletteId, setStoryPaletteId] = useState(AMBIENT_PALETTE.id);
  /**
   * A form or a finish being held up to the object by a pointer, which the
   * object wears until the pointer leaves. Kept apart from the scrolled state
   * so letting go returns it to whatever the story last said, rather than to
   * whatever happened to be previewed.
   */
  const [preview, setPreview] = useState<{ variant?: Variant; paletteId?: string } | null>(null);
  const promptInput = useRef<HTMLInputElement>(null);
  /**
   * The mesh the forge already built, kept so the render does not generate the
   * identical object a second time. State rather than a ref: reading a ref
   * during render is not safe under concurrent rendering.
   */
  const [built, setBuilt] = useState<{
    data: ContributionYear;
    variant: Variant;
    sizeMm: number;
    dampening: number;
    mesh: BuiltMesh;
  } | null>(null);
  const runId = useRef(0);

  const sizeMm = sizeById(sizeId).mm;
  const palette = paletteById(paletteId);

  // The object on the landing page is a measured year, the same frozen 2025 the
  // banner, the share card and the calibration test all draw. An invented year
  // came out about four times denser than a real one, which put a print time
  // and a filament weight on the page that no year would ever produce.
  const ghost = useMemo(
    () => yearFromDays(frozen.login, frozen.year, frozen.days as Day[]),
    [],
  );
  const ghostStats = useMemo(() => computeStats(ghost), [ghost]);

  const shownVariant = preview?.variant ?? storyVariant;
  const shownPaletteId = preview?.paletteId ?? storyPaletteId;

  // Labelled like the kit itself: the landing object is the STL you would
  // download, engraved handle and year included, not a bald stand-in for it.
  const ghostMesh = useMemo(
    () => buildMonolith(ghost, { variant: shownVariant, sizeMm: 180, label: true }),
    [ghost, shownVariant],
  );

  // The story's finish is a real palette worn at the landing's lower glow, so
  // stepping through the finishes changes the object's colour and nothing else.
  const ambientFinish = useMemo(
    () =>
      shownPaletteId === AMBIENT_PALETTE.id
        ? AMBIENT_PALETTE
        : { ...paletteById(shownPaletteId), glow: AMBIENT_PALETTE.glow, rim: AMBIENT_PALETTE.rim },
    [shownPaletteId],
  );

  const onStoryState = useCallback((next: { variant?: Variant; paletteId?: string }) => {
    if (next.variant) setStoryVariant(next.variant);
    if (next.paletteId) setStoryPaletteId(next.paletteId);
  }, []);

  const mesh = useMemo(() => {
    if (!data) return null;
    // The forge already built this mesh to report its triangle count. Reuse it
    // rather than running the generator twice, but only when it was built from
    // exactly this data and configuration: a control touched during the forge's
    // scripted pauses would otherwise leave the readout describing an object
    // that never gets rendered.
    if (built && built.data === data && built.variant === variant && built.sizeMm === sizeMm && built.dampening === dampening) {
      return built.mesh;
    }
    return multi
      ? buildMultiYear(multi, { variant, sizeMm, label: true, dampening })
      : buildMonolith(data, { variant, sizeMm, label: true, dampening });
  }, [data, multi, built, variant, sizeMm, dampening]);

  const forge = useCallback(
    async (
      handle: string,
      forYear: number,
      opts?: {
        keep?: boolean;
        /**
         * Override the subject/span/repo for this one build. The Dock fires a
         * span toggle and a rebuild in the same tick, before React re-renders
         * the memoised `forge` closure, so reading the live state here would be
         * stale; the caller passes the freshly-chosen value instead.
         */
        over?: {
          subject?: "user" | "repo";
          span?: "year" | "lifetime" | "range";
          repoOwner?: string;
          repoName?: string;
          rangeFrom?: string;
          rangeTo?: string;
        };
      },
    ) => {
      const id = ++runId.current;
      const alive = () => runId.current === id;
      const effSubject = opts?.over?.subject ?? subject;
      const effSpan = opts?.over?.span ?? span;
      const effRepoOwner = opts?.over?.repoOwner ?? repoOwner;
      const effRepoName = opts?.over?.repoName ?? repoName;
      const effRangeFrom = opts?.over?.rangeFrom ?? rangeFrom;
      const effRangeTo = opts?.over?.rangeTo ?? rangeTo;
      const fail = (message: string) => {
        setError(message);
        setSteps([]);
        setProgress(0);
        setPhase(opts?.keep ? "live" : "idle");
        play("error");
      };
      setError(null);
      // A build owns the whole screen, so the page goes back to the top and the
      // story hands the object back. Without this, a handle typed after
      // scrolling would build behind a page that was scrolled past it.
      window.scrollTo({ top: 0, behavior: "auto" });
      setStoryVariant("skyline");
      setStoryPaletteId(AMBIENT_PALETTE.id);
      setPhase("forging");
      setSteps([{ label: "resolving", value: handle }]);
      setProgress(0.06);

      const started = Date.now();
      const push = (step: ForgeStep, p: number) => {
        if (!alive()) return;
        setSteps((prev) => [...prev, step]);
        setProgress(p);
        play("tick");
      };

      let payload: { data?: ContributionYear; multi?: MultiYearData; stats: Stats };
      try {
        const endpoint =
          effSubject === "repo"
            ? `/api/repo/${encodeURIComponent(effRepoOwner)}/${encodeURIComponent(effRepoName)}?json`
            : effSpan === "lifetime"
              ? `/api/contributions?login=${encodeURIComponent(handle)}&lifetime=1`
              : effSpan === "range"
                ? `/api/contributions?login=${encodeURIComponent(handle)}&from=${encodeURIComponent(effRangeFrom)}&to=${encodeURIComponent(effRangeTo)}`
                : `/api/contributions?login=${encodeURIComponent(handle)}&year=${forYear}`;
        const res = await fetch(endpoint);
        if (!alive()) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? "GitHub would not answer.");
        }
        payload = await res.json();
      } catch (err) {
        if (!alive()) return;
        fail(err instanceof Error ? err.message : "Something broke.");
        return;
      }
      if (!alive()) return;

      // A year the account simply was not active in. GitHub answers it with a
      // perfectly valid calendar of zeroes, and building that would present an
      // empty plate as a finished object. Say what happened instead.
      const total0 = payload.multi ? payload.multi.totalCommits : payload.data?.total ?? 0;
      if (total0 === 0) {
        const who = payload.multi?.login ?? payload.data?.login ?? handle;
        fail(`GitHub shows no contributions for ${who}${effSpan === "range" ? ` between ${effRangeFrom} and ${effRangeTo}` : ""}.`);
        return;
      }

      const yearLabel =
        effSubject === "repo"
          ? `${effRepoOwner}/${effRepoName}`
          : payload.multi
            ? `${payload.multi.fromYear}–${payload.multi.toYear}`
            : `${forYear}`;

      await wait(Math.max(0, 320 - (Date.now() - started)));
      push(
        {
          label: "fetching",
          value: payload.multi
            ? `${payload.multi.years.length} years of ${payload.multi.login}`
            : `${payload.data?.days.length ?? 0} days of ${forYear}`,
        },
        0.34,
      );

      await wait(280);
      push(
        {
          label: "found",
          value: `${(payload.multi?.totalCommits ?? payload.data?.total ?? 0).toLocaleString("en-GB")} contributions`,
        },
        0.56,
      );

      await wait(300);
      if (!alive()) return;
      // Same arguments the memo will use, kept so the readout describes the
      // object that actually gets rendered.
      const yearData = payload.data;
      const forged = payload.multi
        ? buildMultiYear(payload.multi, { variant, sizeMm, label: true, dampening })
        : buildMonolith(yearData!, { variant, sizeMm, label: true, dampening });
      setBuilt({ data: yearData!, variant, sizeMm, dampening, mesh: forged });
      push(
        {
          label: "extruding",
          value: `${forged.triangles.toLocaleString("en-GB")} triangles`,
        },
        0.78,
      );

      await wait(260);
      push({ label: "welding", value: "base plate and signature" }, 0.92);

      await wait(300);
      if (!alive()) return;
      push(
        {
          label: "ready",
          value: `${forged.size.x.toFixed(0)} × ${forged.size.z.toFixed(0)} mm`,
        },
        1,
      );

      await wait(260);
      if (!alive()) return;
      setData(payload.multi ? payload.multi.years[payload.multi.years.length - 1] : yearData!);
      setMulti(payload.multi ?? null);
      setStats(payload.stats);
      setLogin(payload.multi?.login ?? yearData!.login);
      setYearLabel(yearLabel);
      // The year follows the build that actually landed, not the intent to
      // build it: set upfront by the callers, a failed switch left the dock
      // naming a year the object on screen never was.
      setYear(forYear);
      // A live Halloween calendar is the one seasonal flag GitHub ships; when
      // it is set, offer the matching finish by default unless the viewer has
      // already picked one. F4: the new data reaching the UI as a finish.
      if (yearData?.isHalloween) {
        setPaletteId((cur) => (cur === DEFAULT_PALETTE_ID ? "halloween" : cur));
      }
      setPhase("live");
      setSpin(!reduceMotion);
      play("thunk");
      // Write the full configuration into the URL so a copied link reproduces
      // exactly what was built. F3/M13: a shared link carries the whole state
      // — span, range and repo subject included, or a shared lifetime stack
      // would reopen as a single year.
      const urlLogin = effSubject === "repo" ? effRepoOwner : (payload.multi?.login ?? yearData!.login);
      window.history.replaceState(
        null,
        "",
        `/s/${urlLogin}?${modelQuery({
          login: urlLogin,
          year: forYear,
          variant,
          sizeMm,
          paletteId: paletteId,
          dampening,
          span: effSpan,
          from: effRangeFrom,
          to: effRangeTo,
          subject: effSubject,
          repoOwner: effRepoOwner,
          repoName: effRepoName,
        })}`,
      );
    },
    [variant, sizeMm, reduceMotion, paletteId, dampening, subject, span, repoOwner, repoName, rangeFrom, rangeTo],
  );

  // Deep-link boot. The guard is what makes this run once, rather than an
  // rebuilt whenever the form or size changes, and without the ref a shared
  // link would rebuild itself every time you touched a control.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || !initialLogin) return;
    booted.current = true;
    void forge(initialLogin, initialYear ?? years[0]);
  }, [initialLogin, initialYear, years, forge]);

  // The "star on github" chip earns its keep by showing a real count rather
  // than just being a link. One unauthenticated call, once, and silence on
  // failure: a missing star count is not worth an error state over.
  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${PROJECT.repo}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { stargazers_count?: number } | null) => {
        if (!cancelled && typeof json?.stargazers_count === "number") {
          setStars(json.stargazers_count);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // M16 in the HUD: once a single user year is live, ask for the hour-of-day
  // histogram. Fire-and-forget with a cancellation guard; a rate-limited
  // search API just means the HUD shows no histogram, never an error. Stale
  // data is filtered at render time (the HUD only shows a histogram matching
  // the login and year on screen), so nothing needs clearing here.
  useEffect(() => {
    if (phase !== "live" || subject !== "user" || span !== "year" || !login) return;
    let cancelled = false;
    fetch(`/api/contributions?hours=${encodeURIComponent(login)}&year=${year}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { hours?: CommitHoursData } | null) => {
        if (!cancelled && json?.hours && json.hours.sampled > 0) setCommitHours(json.hours);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [phase, subject, span, login, year]);

  /** The histogram, only when it describes exactly the object on screen. */
  const hoursForHud =
    commitHours &&
    subject === "user" &&
    span === "year" &&
    commitHours.year === year &&
    commitHours.login.toLowerCase() === login.toLowerCase()
      ? commitHours
      : null;

  const reset = useCallback(() => {
    runId.current++;
    setPhase("idle");
    setData(null);
    setStats(null);
    setBuilt(null);
    setSteps([]);
    setProgress(0);
    setError(null);
    setCommitHours(null);
    window.history.replaceState(null, "", "/");
  }, []);

  // Slash puts the caret in the field from anywhere on the landing page, the
  // shortcut every developer already has in their hands.
  useEffect(() => {
    if (phase !== "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      promptInput.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  useEffect(() => {
    // While a sheet is open it owns the keyboard. Otherwise Escape would close
    // the sheet AND reset the app, throwing away the object and the share URL,
    // and 1-4 would swap the form behind the open dialog.
    if (phase !== "live" || printing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VARIANTS.length) {
        play("step");
        setVariant(VARIANTS[n - 1].id);
      }
      // Year stepping only means something on a single user year: a lifetime
      // stack, a range or a repo skyline has no "previous year" to step to,
      // and firing the year fetch from those modes would silently swap the
      // object out from under its own label.
      if ((e.key === "[" || e.key === "]") && span === "year" && subject === "user") {
        const i = liveYears.indexOf(year) + (e.key === "[" ? 1 : -1);
        if (liveYears[i] !== undefined) {
          play("step");
          void forge(login, liveYears[i], { keep: true });
        }
      }
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, printing, liveYears, year, login, forge, reset, span, subject]);

  async function share() {
    const urlLogin = subject === "repo" ? repoOwner : login;
    const url = `${window.location.origin}/s/${urlLogin}?${modelQuery({
      login: urlLogin,
      year,
      variant,
      sizeMm,
      paletteId: paletteId,
      dampening,
      span,
      from: rangeFrom,
      to: rangeTo,
      subject,
      repoOwner,
      repoName,
    })}`;
    // On touch devices the native share sheet reaches the places a copied
    // link is actually headed; everywhere else the clipboard stays quickest.
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ url, title: `${login} on MONOLITH` });
        play("lock");
        return;
      } catch {
        // Cancelled or unsupported payload: fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      play("lock");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      play("error");
    }
  }

  const activeMesh = mesh ?? ghostMesh;
  const isGhost = phase !== "live" || !mesh;

  // The live phase has no prompt row to carry an error, so one shown there is
  // transient by design: it says what failed and gets out of the way, because
  // the object still on screen is the thing that matters.
  useEffect(() => {
    if (phase !== "live" || !error) return;
    const timer = window.setTimeout(() => setError(null), 3600);
    return () => window.clearTimeout(timer);
  }, [phase, error]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Two columns from the width the headline stops wrapping at. Below it the
  // object goes back to sitting under the copy, because a 34 rem column beside
  // an object on a phone leaves neither of them readable.
  const twoColumn = useMediaQuery("(min-width: 900px)");
  /** A phone, where the dock is two rows deep and covers more of the stage. */
  const phone = useMediaQuery("(max-width: 639px)");
  /** A window with no vertical room to spare, typically a phone held sideways. */
  const shortScreen = useMediaQuery("(max-height: 520px)");

  return (
    <MotionConfig reducedMotion="user">
      <main
        className={
          phase === "idle"
            ? "relative w-full bg-void"
            : "relative h-svh w-full overflow-hidden bg-void"
        }
      >
        {/* Fixed rather than absolute: the story scrolls past a stage that
          stays put, which is what makes the object read as one object being
          shown four ways rather than four pictures going by. */}
        <div className="fixed inset-0 z-0" onPointerDown={() => setTurned(true)}>
          <Scene
            mesh={activeMesh}
            finish={isGhost ? ambientFinish : palette}
            ghost={isGhost}
            revealToken={`${login}:${year}:${isGhost ? shownVariant : variant}`}
            spin={spin && !reduceMotion}
            onInteract={() => setSpin(false)}
            onGrab={() => setTurned(true)}
            shiftX={twoColumn ? 0.22 : 0}
            shiftY={twoColumn ? -0.02 : -0.23}
            pad={twoColumn ? 2.2 : 1.85}
            // The viewer fits the object to the frame, which is right on a
            // wide screen and wrong on a phone: the dock covers the bottom
            // fifth of it, and a turn to broadside pushes a 365-day skyline
            // off both edges. Stand back a little and lift it clear.
            livePad={twoColumn ? 1 : 1.06}
            liveShiftY={phone ? -0.07 : 0}
            liveTurnSafe={!twoColumn}
            reduced={reduceMotion}
            studio={studio}
          />
        </div>

        <CursorField />
        <div className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_58%,rgba(6,7,8,0.55)_100%)]" />

        {/* The object is free to drift anywhere behind the readouts, so the
          readouts carry their own darkness rather than trusting whatever
          happens to be rendered under them. */}
        {/* Wide, the copy is on the left and the object on the right, so the
          scrims darken the left column and the top strip the wordmark sits in.
          Narrow, the object is what occupies the top of the screen, and the
          same two scrims would be painting it out. */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[15] h-[16%] bg-gradient-to-b from-void/85 via-void/30 to-transparent min-[900px]:h-[34%] min-[900px]:from-void min-[900px]:via-void/55" />
        <div className="pointer-events-none fixed inset-y-0 left-0 z-[15] hidden w-[min(26rem,60vw)] bg-gradient-to-r from-void via-void/45 to-transparent min-[900px]:block" />

        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between p-5 sm:p-7">
          <button
            type="button"
            onClick={reset}
            className="pointer-events-auto text-[0.62rem] tracking-[0.34em] uppercase text-mute transition-colors duration-150 hover:text-fog"
          >
            Monolith
          </button>

          {/* The landing makes a noise on every keystroke, so the switch for
            that noise cannot live only in the dock a build away. Whatever the
            stored preference or the reduced-motion default decided, this is
            where it becomes visible and reversible. */}
          <AnimatePresence>
            {phase === "idle" && (
              <motion.button
                type="button"
                onClick={() => setSoundEnabled(!sound)}
                aria-pressed={sound}
                aria-label={sound ? "Sound on" : "Sound off"}
                className="pointer-events-auto flex items-center gap-2 text-[0.62rem] tracking-[0.18em] uppercase text-mute transition-colors duration-150 hover:text-fog"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <span aria-hidden>{sound ? "◉" : "◎"}</span>
                {/* "sound off" at this tracking is 78 px, which ran off the
                  right edge of a 393 px screen. The state is the word. */}
                <span className="sm:hidden">{sound ? "on" : "off"}</span>
                <span className="hidden sm:inline">{sound ? "sound on" : "sound off"}</span>
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === "live" && (
              <motion.div
                className="pointer-events-auto flex min-w-0 items-center gap-1.5 text-[0.6rem] tracking-[0.18em] uppercase sm:gap-3"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Every control here wears the same chip, share and new
                  included, so the row reads as one family rather than two
                  plain links bolted onto two branded ones. */}
                {/* Narrow, every word here is dropped and the glyph carries
                  the control. Four labelled chips came to about 470 px on a
                  393 px phone, so the last of them was off the screen and
                  pressing any of them panned the whole page sideways. */}
                <button
                  type="button"
                  onClick={share}
                  aria-label="Copy link to this year"
                  className="hairline flex h-9 items-center gap-1.5 rounded-[3px] px-2.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog sm:h-auto sm:py-1.5"
                >
                  <span aria-hidden className="text-accent">
                    {copied ? "✓" : "⇪"}
                  </span>
                  {copied ? (
                    <span className="text-accent">
                      link copied
                    </span>
                  ) : (
                    <span className="hidden sm:inline">share</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Build another year"
                  className="hairline flex h-9 items-center gap-1.5 rounded-[3px] px-2.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog sm:h-auto sm:py-1.5"
                >
                  <span aria-hidden className="text-accent">
                    +
                  </span>
                  <span className="hidden sm:inline">new</span>
                </button>
                {/* The two doors off a shared page, worn as chips so a visitor
                  who just received someone's year can find the maker and the
                  repository without hunting for a footer that is not there. */}
                <a
                  href={PROJECT.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Star this project on GitHub"
                  className="hairline flex h-9 items-center gap-1.5 rounded-[3px] px-2.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog sm:h-auto sm:py-1.5"
                >
                  <span aria-hidden className="text-accent">
                    ★
                  </span>
                  <span className="hidden sm:inline">star on github</span>
                  {stars !== null && (
                    <span className="tabular-nums text-dim">
                      {stars.toLocaleString("en-GB")}
                    </span>
                  )}
                </a>
                {/* The maker's door. Narrow it would be the fifth chip in a row
                  that has no space for four, and the print sheet carries the
                  same link a tap away. */}
                <a
                  href={PROJECT.authorSite}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hairline hidden items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog sm:flex"
                >
                  by {PROJECT.authorSiteName}
                  <span aria-hidden className="text-accent">
                    ↗
                  </span>
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* The hero owns exactly one screen. Everything in it is positioned
          against this section rather than against the page, so it leaves when
          the story arrives instead of following it down. */}
        <section className="pointer-events-none relative h-svh w-full snap-start">
          <Prompt
            onSubmit={(handle) => forge(handle, year)}
            error={error}
            hidden={phase !== "idle"}
            inputRef={promptInput}
          />

          {/* Whose year this is. Without the caption the object reads as a
            rendering of nothing in particular; with it, the landing is showing
            a real 2025 that anyone can check against the handle beside it. */}
          <AnimatePresence>
            {phase === "idle" && (
              <motion.figcaption
                className="pointer-events-none absolute bottom-[20%] right-[max(3rem,6vw)] z-20 hidden text-right text-[0.58rem] leading-relaxed tracking-[0.2em] uppercase text-dim min-[900px]:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="normal-case tracking-[0.12em] text-mute">{ghost.login}</span> · {ghost.year}
                <br />
                {ghost.total.toLocaleString("en-GB")} contributions ·{" "}
                {ghostStats.activeDays} active days
              </motion.figcaption>
            )}
          </AnimatePresence>

        {/* The object turns under the pointer, which is worth nothing if nobody
          learns it. One line, under the object's own column, gone for good the
          first time a hand lands on it. */}
        <AnimatePresence>
          {phase === "idle" && twoColumn && !turned && (
            <motion.p
              className="pointer-events-none absolute bottom-[13%] right-[max(3rem,6vw)] z-20 flex items-center gap-2 text-[0.58rem] tracking-[0.22em] uppercase text-dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 1.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.span
                aria-hidden
                animate={reduceMotion ? {} : { x: [-2.5, 2.5, -2.5] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              >
                ↔
              </motion.span>
              drag to turn it
            </motion.p>
          )}
        </AnimatePresence>

          <AnimatePresence>
            {/* Sideways on a phone there is no band left under the field to
              put this in, and it landed on the row of examples. */}
            {phase === "idle" && !shortScreen && (
              <motion.button
                type="button"
                onClick={() =>
                  window.scrollTo({
                    top: window.innerHeight,
                    behavior: reduceMotion ? "auto" : "smooth",
                  })
                }
                className="pointer-events-auto absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 sm:bottom-[3.4rem] text-[0.56rem] tracking-[0.24em] uppercase text-dim transition-colors duration-150 hover:text-fog"
                initial={{ opacity: 0 }}
                animate={{ opacity: scrolled ? 0 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, delay: scrolled ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
                aria-hidden={scrolled}
                inert={scrolled}
              >
                <motion.span
                  aria-hidden
                  animate={reduceMotion ? {} : { y: [0, 3, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  ↓
                </motion.span>
                what you get
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === "idle" && !shortScreen && (
              <motion.footer
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-center justify-between px-5 pb-5 text-[0.58rem] tracking-[0.18em] uppercase text-dim sm:flex sm:px-7 sm:pb-7"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <span>Source available · the files are free · print it yourself</span>
                {/* The two ways off the page, worn as chips rather than muttered
                  in the margin: the one person and the one repository behind
                  the object deserve at least a border. */}
                <span className="hidden items-center gap-2 sm:flex">
                  <a
                    href={PROJECT.authorSite}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hairline pointer-events-auto flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog"
                  >
                    by {PROJECT.authorSiteName}
                    <span aria-hidden className="text-accent">
                      ↗
                    </span>
                  </a>
                  <a
                    href={PROJECT.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hairline pointer-events-auto flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog"
                  >
                    github.com/{PROJECT.repo}
                    <span aria-hidden className="text-accent">
                      ↗
                    </span>
                  </a>
                </span>
              </motion.footer>
            )}
          </AnimatePresence>
        </section>

        {phase === "idle" && (
          <Story
            mesh={ghostMesh}
            login={ghost.login}
            year={ghost.year}
            state={{ variant: storyVariant, paletteId: storyPaletteId }}
            onState={onStoryState}
            onPreview={setPreview}
            onTop={() => {
              window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
              promptInput.current?.focus({ preventScroll: true });
            }}
          />
        )}

        <Forge
          steps={steps}
          progress={progress}
          visible={phase === "forging"}
        />

        {phase === "live" && data && stats && mesh && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <Hud data={data} stats={stats} mesh={mesh} variant={variant} yearLabel={yearLabel} commitHours={hoursForHud} />
          </div>
        )}

        <AnimatePresence>
          {phase === "live" && error && (
            <motion.p
              className="pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2 whitespace-nowrap rounded-[4px] border border-danger/40 bg-ink/90 px-3 py-1.5 text-[0.62rem] tracking-[0.16em] uppercase text-danger backdrop-blur-sm"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <Dock
        visible={phase === "live" && !!data}
        year={year}
        years={liveYears}
        onYear={(y) => {
          void forge(login, y, { keep: true });
        }}
        subject={subject}
        onSubject={setSubject}
        repoOwner={repoOwner}
        onRepoOwner={setRepoOwner}
        repoName={repoName}
        onRepoName={setRepoName}
        span={span}
        onSpan={setSpan}
        rangeFrom={rangeFrom}
        onRangeFrom={setRangeFrom}
        rangeTo={rangeTo}
        onRangeTo={setRangeTo}
          variant={variant}
          onVariant={setVariant}
          palette={palette}
          onPalette={setPaletteId}
          sizeId={sizeId}
          onSize={setSizeId}
          printerId={printerId}
          onPrinter={setPrinterId}
          dampening={dampening}
          onDampening={setDampening}
          total={stats?.total ?? 0}
          onPrint={() => setPrinting(true)}
          spin={spin && !reduceMotion}
          onSpin={setSpin}
          sound={sound}
          onSound={setSoundEnabled}
          studio={studio}
          onStudio={setStudio}
          onRebuild={(over) => {
            void forge(login, year, { keep: true, over });
          }}
        />

        {mesh && (
          <>
            <PrintSheet
              open={printing}
              onClose={() => setPrinting(false)}
              login={login}
              year={year}
              yearLabel={yearLabel}
              variant={variant}
              sizeMm={sizeMm}
              mesh={mesh}
              printerId={printerId}
              onPrinter={setPrinterId}
              dampening={dampening}
              paletteId={paletteId}
              span={span}
              rangeFrom={rangeFrom}
              rangeTo={rangeTo}
              subject={subject}
              repoOwner={repoOwner}
              repoName={repoName}
            />
          </>
        )}

      </main>
    </MotionConfig>
  );
}
