"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { Prompt } from "./Prompt";
import { Forge, type ForgeStep } from "./Forge";
import { Hud } from "./Hud";
import { Dock } from "./Dock";
import { OrderSheet } from "./OrderSheet";
import { SIZES, VARIANTS, buildMonolith, computeStats } from "@/lib/build";
import { availableYears, syntheticYear } from "@/lib/github";
import { GHOST_FINISH, finishById } from "@/lib/products";
import { initSound, play, setSoundEnabled, soundEnabled } from "@/lib/sound";
import type { SizeId } from "@/lib/build";
import type { ContributionYear, Stats, Variant } from "@/lib/types";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

type Phase = "idle" | "forging" | "live";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MonolithApp({ initialLogin, initialYear }: { initialLogin?: string; initialYear?: number }) {
  const years = useMemo(() => availableYears(7), []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [login, setLogin] = useState(initialLogin ?? "");
  const [year, setYear] = useState(initialYear ?? years[0]);
  const [variant, setVariant] = useState<Variant>("skyline");
  const [finishId, setFinishId] = useState("signal");
  const [sizeId, setSizeId] = useState<SizeId>("shelf");
  const [data, setData] = useState<ContributionYear | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [steps, setSteps] = useState<ForgeStep[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(true);
  const [sound, setSound] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [copied, setCopied] = useState(false);
  const runId = useRef(0);

  useEffect(() => {
    initSound();
    setSound(soundEnabled());
  }, []);

  const sizeMm = SIZES.find((s) => s.id === sizeId)?.mm ?? 180;
  const finish = finishById(finishId);

  // The idle backdrop is a real object, built from a fixed seed, so the landing
  // page shows the product rather than describing it.
  const ghost = useMemo(() => syntheticYear("skyline", years[0]), [years]);
  const ghostMesh = useMemo(
    () => buildMonolith(ghost, { variant: "skyline", sizeMm: 180, label: false }),
    [ghost],
  );

  const mesh = useMemo(
    () => (data ? buildMonolith(data, { variant, sizeMm, label: true }) : null),
    [data, variant, sizeMm],
  );

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
      push({ label: "fetching", value: `${payload.data.days.length} days of ${forYear}` }, 0.34);

      await wait(280);
      push(
        { label: "found", value: `${payload.data.total.toLocaleString("en-GB")} contributions` },
        0.56,
      );

      await wait(300);
      const built = buildMonolith(payload.data, { variant, sizeMm, label: true });
      if (!alive()) return;
      push({ label: "extruding", value: `${built.triangles.toLocaleString("en-GB")} triangles` }, 0.78);

      await wait(260);
      push({ label: "welding", value: "base plate and signature" }, 0.92);

      await wait(300);
      if (!alive()) return;
      push({ label: "ready", value: `${built.size.x.toFixed(0)} × ${built.size.z.toFixed(0)} mm` }, 1);

      await wait(260);
      if (!alive()) return;
      setData(payload.data);
      setStats(payload.stats);
      setLogin(payload.data.login);
      setPhase("live");
      setSpin(true);
      play("thunk");
      window.history.replaceState(null, "", `/s/${payload.data.login}?year=${forYear}`);
    },
    [variant, sizeMm],
  );

  useEffect(() => {
    if (initialLogin) void forge(initialLogin, initialYear ?? years[0]);
    // Deliberately runs once: this is the deep-link boot, not a reactive rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    setPhase("idle");
    setData(null);
    setStats(null);
    setSteps([]);
    setProgress(0);
    setError(null);
    window.history.replaceState(null, "", "/");
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
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
  }, [phase, years, year, login, forge, reset]);

  const stlHref = `/api/stl?login=${encodeURIComponent(login)}&year=${year}&variant=${variant}&mm=${sizeMm}`;

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

  return (
    <main className="relative h-svh w-full overflow-hidden bg-void">
      <div className="absolute inset-0 z-0">
        <Scene
          mesh={activeMesh}
          finish={isGhost ? GHOST_FINISH : finish}
          ghost={isGhost}
          revealToken={`${login}:${year}:${variant}`}
          spin={spin}
          onInteract={() => setSpin(false)}
        />
      </div>

      <div className="field pointer-events-none absolute inset-0 z-10 opacity-[0.55]" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_38%,rgba(6,7,8,0.82)_100%)]" />

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
                {copied ? <span className="text-accent">link copied</span> : "share ↗"}
              </button>
              <span className="text-line">/</span>
              <button
                type="button"
                onClick={reset}
                className="text-mute transition-colors duration-150 hover:text-fog"
              >
                new
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Prompt onSubmit={(handle) => forge(handle, year)} error={error} hidden={phase !== "idle"} />

      <Forge steps={steps} progress={progress} visible={phase === "forging"} />

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
        finish={finish}
        onFinish={setFinishId}
        sizeId={sizeId}
        onSize={setSizeId}
        total={stats?.total ?? 0}
        stlHref={stlHref}
        onOrder={() => setOrdering(true)}
        spin={spin}
        onSpin={setSpin}
        sound={sound}
        onSound={(next) => {
          setSoundEnabled(next);
          setSound(next);
        }}
      />

      <OrderSheet
        open={ordering}
        onClose={() => setOrdering(false)}
        login={login}
        year={year}
        variant={variant}
        finish={finish}
      />

      <AnimatePresence>
        {phase === "idle" && (
          <motion.footer
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-5 pb-5 text-[0.58rem] tracking-[0.18em] uppercase text-dim sm:px-7 sm:pb-7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <span>STL is free · the object is not</span>
            <span className="hidden sm:inline">no account, no upload, no cookie banner</span>
          </motion.footer>
        )}
      </AnimatePresence>
    </main>
  );
}
