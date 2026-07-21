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
import { PROJECT } from "@/lib/project";
import { VARIANTS, buildMonolith, sizeById } from "@/lib/build";
import { SELECTABLE_YEARS, availableYears, syntheticYear } from "@/lib/contributions";
import { AMBIENT_PALETTE, DEFAULT_PALETTE_ID, paletteById } from "@/lib/palettes";
import {
  play,
  setSoundEnabled,
  soundEnabled,
  soundServerSnapshot,
  subscribeSound,
} from "@/lib/sound";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { SizeId } from "@/lib/build";
import type { BuiltMesh, ContributionYear, Stats, Variant } from "@/lib/types";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

type Phase = "idle" | "forging" | "live";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MonolithApp({
  initialLogin,
  initialYear,
}: {
  initialLogin?: string;
  initialYear?: number;
}) {
  const years = useMemo(() => availableYears(SELECTABLE_YEARS), []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [login, setLogin] = useState(initialLogin ?? "");
  const [year, setYear] = useState(initialYear ?? years[0]);
  const [variant, setVariant] = useState<Variant>("skyline");
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID);
  const [sizeId, setSizeId] = useState<SizeId>("shelf");
  const [data, setData] = useState<ContributionYear | null>(null);
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
  /** Whether the object has been taken hold of. The hint is owed until it is. */
  const [turned, setTurned] = useState(false);
  /**
   * The mesh the forge already built, kept so the render does not generate the
   * identical object a second time. State rather than a ref: reading a ref
   * during render is not safe under concurrent rendering.
   */
  const [built, setBuilt] = useState<{
    data: ContributionYear;
    variant: Variant;
    sizeMm: number;
    mesh: BuiltMesh;
  } | null>(null);
  const runId = useRef(0);

  const sizeMm = sizeById(sizeId).mm;
  const palette = paletteById(paletteId);

  // The idle backdrop is a real object, built from a fixed seed, so the landing
  // page shows the product rather than describing it.
  const ghost = useMemo(() => syntheticYear("skyline", years[0]), [years]);
  const ghostMesh = useMemo(
    () =>
      buildMonolith(ghost, { variant: "skyline", sizeMm: 180, label: false }),
    [ghost],
  );

  const mesh = useMemo(() => {
    if (!data) return null;
    // The forge already built this mesh to report its triangle count. Reuse it
    // rather than running the generator twice, but only when it was built from
    // exactly this data and configuration: a control touched during the forge's
    // scripted pauses would otherwise leave the readout describing an object
    // that never gets rendered.
    if (built && built.data === data && built.variant === variant && built.sizeMm === sizeMm) {
      return built.mesh;
    }
    return buildMonolith(data, { variant, sizeMm, label: true });
  }, [data, built, variant, sizeMm]);

  const forge = useCallback(
    async (handle: string, forYear: number) => {
      const id = ++runId.current;
      const alive = () => runId.current === id;
      setError(null);
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

      let payload: { data: ContributionYear; stats: Stats };
      try {
        const res = await fetch(
          `/api/contributions?login=${encodeURIComponent(handle)}&year=${forYear}`,
        );
        if (!alive()) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? "GitHub would not answer.");
        }
        payload = await res.json();
      } catch (err) {
        if (!alive()) return;
        setError(err instanceof Error ? err.message : "Something broke.");
        setPhase("idle");
        setSteps([]);
        setProgress(0);
        play("error");
        return;
      }
      if (!alive()) return;

      await wait(Math.max(0, 320 - (Date.now() - started)));
      push(
        {
          label: "fetching",
          value: `${payload.data.days.length} days of ${forYear}`,
        },
        0.34,
      );

      await wait(280);
      push(
        {
          label: "found",
          value: `${payload.data.total.toLocaleString("en-GB")} contributions`,
        },
        0.56,
      );

      await wait(300);
      if (!alive()) return;
      // Same arguments the memo will use, kept so the readout describes the
      // object that actually gets rendered.
      const forged = buildMonolith(payload.data, {
        variant,
        sizeMm,
        label: true,
      });
      setBuilt({ data: payload.data, variant, sizeMm, mesh: forged });
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
      setData(payload.data);
      setStats(payload.stats);
      setLogin(payload.data.login);
      setPhase("live");
      setSpin(!reduceMotion);
      play("thunk");
      window.history.replaceState(
        null,
        "",
        `/s/${payload.data.login}?year=${forYear}`,
      );
    },
    [variant, sizeMm, reduceMotion],
  );

  // Deep-link boot. The guard is what makes this run once, rather than an
  // empty dependency list that lies about what the effect reads: `forge` is
  // rebuilt whenever the form or size changes, and without the ref a shared
  // link would rebuild itself every time you touched a control.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || !initialLogin) return;
    booted.current = true;
    void forge(initialLogin, initialYear ?? years[0]);
  }, [initialLogin, initialYear, years, forge]);

  const reset = useCallback(() => {
    runId.current++;
    setPhase("idle");
    setData(null);
    setStats(null);
    setBuilt(null);
    setSteps([]);
    setProgress(0);
    setError(null);
    window.history.replaceState(null, "", "/");
  }, []);

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
      if (e.key === "[" || e.key === "]") {
        const i = years.indexOf(year) + (e.key === "[" ? 1 : -1);
        if (years[i] !== undefined) {
          play("step");
          setYear(years[i]);
          void forge(login, years[i]);
        }
      }
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, printing, years, year, login, forge, reset]);

  async function share() {
    const url = `${window.location.origin}/s/${login}?year=${year}`;
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

  // Two columns from the width the headline stops wrapping at. Below it the
  // object goes back to sitting under the copy, because a 34 rem column beside
  // an object on a phone leaves neither of them readable.
  const twoColumn = useMediaQuery("(min-width: 900px)");

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative h-svh w-full overflow-hidden bg-void">
        <div className="absolute inset-0 z-0" onPointerDown={() => setTurned(true)}>
          <Scene
            mesh={activeMesh}
            finish={isGhost ? AMBIENT_PALETTE : palette}
            ghost={isGhost}
            revealToken={`${login}:${year}:${variant}`}
            spin={spin && !reduceMotion}
            onInteract={() => setSpin(false)}
            shiftX={twoColumn ? 0.22 : 0}
            shiftY={twoColumn ? -0.02 : -0.19}
            pad={twoColumn ? 2.55 : 2.0}
            reduced={reduceMotion}
          />
        </div>

        <div className="field pointer-events-none absolute inset-0 z-10 opacity-40" />
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_58%,rgba(6,7,8,0.55)_100%)]" />

        {/* The object is free to drift anywhere behind the readouts, so the
          readouts carry their own darkness rather than trusting whatever
          happens to be rendered under them. */}
        {/* Wide, the copy is on the left and the object on the right, so the
          scrims darken the left column and the top strip the wordmark sits in.
          Narrow, the object is what occupies the top of the screen, and the
          same two scrims would be painting it out. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[15] h-[16%] bg-gradient-to-b from-void/85 via-void/30 to-transparent min-[900px]:h-[34%] min-[900px]:from-void min-[900px]:via-void/55" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[15] hidden w-[min(26rem,60vw)] bg-gradient-to-r from-void via-void/45 to-transparent min-[900px]:block" />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between p-5 sm:p-7">
          <button
            type="button"
            onClick={reset}
            className="pointer-events-auto text-[0.62rem] tracking-[0.34em] uppercase text-mute transition-colors duration-150 hover:text-fog"
          >
            Monolith
          </button>

          <AnimatePresence>
            {phase === "live" && (
              <motion.div
                className="pointer-events-auto flex items-center gap-3 text-[0.6rem] tracking-[0.18em] uppercase"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <button
                  type="button"
                  onClick={share}
                  className="text-mute transition-colors duration-150 hover:text-fog"
                >
                  {copied ? (
                    <span className="text-accent">link copied</span>
                  ) : (
                    "share ↗"
                  )}
                </button>
                <span aria-hidden className="text-edge">
                  /
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="text-mute transition-colors duration-150 hover:text-fog"
                >
                  new
                </button>
                <span aria-hidden className="text-edge">
                  /
                </span>
                <a
                  href={PROJECT.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-mute transition-colors duration-150 hover:text-fog"
                >
                  source ↗
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Prompt
          onSubmit={(handle) => forge(handle, year)}
          error={error}
          hidden={phase !== "idle"}
        />

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

        <Forge
          steps={steps}
          progress={progress}
          visible={phase === "forging"}
        />

        {phase === "live" && data && stats && mesh && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <Hud data={data} stats={stats} mesh={mesh} variant={variant} />
          </div>
        )}

        <Dock
          visible={phase === "live" && !!data}
          year={year}
          years={years}
          onYear={(y) => {
            setYear(y);
            void forge(login, y);
          }}
          variant={variant}
          onVariant={setVariant}
          palette={palette}
          onPalette={setPaletteId}
          sizeId={sizeId}
          onSize={setSizeId}
          total={stats?.total ?? 0}
          onPrint={() => setPrinting(true)}
          spin={spin && !reduceMotion}
          onSpin={setSpin}
          sound={sound}
          onSound={setSoundEnabled}
        />

        {mesh && (
          <>
            <PrintSheet
              open={printing}
              onClose={() => setPrinting(false)}
              login={login}
              year={year}
              variant={variant}
              sizeMm={sizeMm}
                mesh={mesh}
            />
          </>
        )}

        <AnimatePresence>
          {phase === "idle" && (
            <motion.footer
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-5 pb-5 text-[0.58rem] tracking-[0.18em] uppercase text-dim sm:px-7 sm:pb-7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <span>Source available · the files are free · print it yourself</span>
              <a
                href={PROJECT.url}
                target="_blank"
                rel="noreferrer noopener"
                className="pointer-events-auto hidden transition-colors duration-150 hover:text-fog sm:inline"
              >
                github.com/{PROJECT.repo} ↗
              </a>
            </motion.footer>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
