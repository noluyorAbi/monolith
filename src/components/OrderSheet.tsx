"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SHIPPING, formatPrice, quote, type ShippingId } from "@/lib/products";
import { DEFAULT_SLOT_COLOURS, SWATCHES, swatchById } from "@/lib/filaments";
import { MATERIALS, QUALITIES, estimate } from "@/lib/print";
import { splitByLevel } from "@/lib/parts";
import { SIZES } from "@/lib/build";
import { PROJECT } from "@/lib/project";
import type { BuiltMesh, Variant } from "@/lib/types";
import type { ColourSlots } from "@/lib/slots";
import { play } from "@/lib/sound";

const EASE = [0.32, 0.72, 0, 1] as const;
const SOFT = [0.16, 1, 0.3, 1] as const;

type Step = "configure" | "done";

function Confetti() {
  const reduced = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        x: (i * 37) % 100,
        delay: (i % 7) * 0.035,
        drift: ((i * 53) % 60) - 30,
        rotate: ((i * 91) % 360) - 180,
        color: ["#d7ff45", "#39d353", "#ecece9", "#8ba32c"][i % 4],
      })),
    [],
  );
  if (reduced) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute top-0 h-1.5 w-1.5"
          style={{ left: `${b.x}%`, background: b.color }}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: "60vh", x: b.drift, opacity: [0, 1, 1, 0], rotate: b.rotate }}
          transition={{ duration: 1.9, delay: b.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}

function Pick({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-[5px] border px-2.5 py-1.5 text-[0.68rem] transition-colors duration-150 active:scale-[0.97] ${
        active ? "border-accent bg-accent/[0.08] text-fog" : "border-edge text-mute hover:text-fog"
      }`}
    >
      {children}
    </button>
  );
}

export interface OrderSheetProps {
  open: boolean;
  onClose: () => void;
  login: string;
  year: number;
  variant: Variant;
  sizeMm: number;
  paletteId: string;
  mesh: BuiltMesh;
}

export function OrderSheet(props: OrderSheetProps) {
  const [step, setStep] = useState<Step>("configure");
  const [materialId, setMaterialId] = useState("pla");
  const [slots, setSlots] = useState<ColourSlots>(1);
  const [shippingId, setShippingId] = useState<ShippingId>("de");
  const [colours, setColours] = useState<string[]>(DEFAULT_SLOT_COLOURS);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ orderId: string; url: string; demo: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (props.open) {
      setStep("configure");
      setResult(null);
      setError(null);
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const material = MATERIALS.find((m) => m.id === materialId)!;
  // We print at Standard, so the quote has to be built on what actually runs.
  const quality = QUALITIES.find((q) => q.id === "standard")!;
  const est = useMemo(
    () => estimate(splitByLevel(props.mesh), material, quality),
    [props.mesh, material, quality],
  );
  const hours = (est.hoursLow + est.hoursHigh) / 2;
  const bill = useMemo(
    () => quote({ grams: est.grams, hours, slots }, shippingId),
    [est.grams, hours, slots, shippingId],
  );

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: props.login,
          year: props.year,
          variant: props.variant,
          palette: props.paletteId,
          sizeMm: props.sizeMm,
          material: materialId,
          quality: "standard",
          slots,
          shipping: shippingId,
          colours: colours.slice(0, slots),
          ...(email ? { email } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      if (json.demo) {
        setResult({ orderId: json.orderId, url: json.url, demo: true });
        setStep("done");
        play("chime");
      } else {
        window.location.href = json.url;
      }
    } catch {
      setError("Checkout did not go through. Nothing was charged.");
      play("error");
    } finally {
      setBusy(false);
    }
  }

  const sizeName = SIZES.find((s) => s.mm === props.sizeMm)?.name ?? "";

  return (
    <AnimatePresence>
      {props.open && (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-void/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={props.onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Have it printed"
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-edge bg-ink"
            style={{ maxHeight: "90svh" }}
            initial={{ y: "100%" }}
            animate={{
              y: 0,
              height: wide ? "auto" : step === "done" ? "min(22rem, 58svh)" : "min(36rem, 86svh)",
            }}
            exit={{ y: "100%" }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 420) props.onClose();
            }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="flex items-center justify-between px-5 pt-4 sm:px-7">
              <div className="mx-auto h-1 w-9 rounded-full bg-edge sm:hidden" />
            </div>

            <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-5 pb-4 pt-3 sm:px-7">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-[1.15rem] tracking-[-0.02em] text-fog">
                  {step === "done" ? "Order placed" : "No printer? We will run it."}
                </h3>
                <p className="mt-1 text-[0.66rem] tracking-[0.1em] uppercase text-dim">
                  {props.login} · {props.year} · {props.variant} · {sizeName} {props.sizeMm}mm
                </p>
              </div>
              <button
                type="button"
                onClick={props.onClose}
                aria-label="Close"
                className="hairline grid h-7 w-7 shrink-0 place-items-center rounded-[5px] text-mute transition-colors duration-150 hover:text-fog active:scale-[0.95]"
              >
                ✕
              </button>
            </div>

            <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-5 pb-7 sm:px-7">
              <AnimatePresence mode="wait" initial={false}>
                {step === "configure" && (
                  <motion.div
                    key="configure"
                    className="grid gap-6 sm:grid-cols-2"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.28, ease: SOFT }}
                  >
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-col gap-2">
                        <span className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                          Filament
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {MATERIALS.map((m) => (
                            <Pick
                              key={m.id}
                              active={materialId === m.id}
                              title={m.note}
                              onClick={() => {
                                play("step");
                                setMaterialId(m.id);
                              }}
                            >
                              {m.name}
                            </Pick>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                          Colours
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {([1, 4] as ColourSlots[]).map((n) => (
                            <Pick
                              key={n}
                              active={slots === n}
                              onClick={() => {
                                play("step");
                                setSlots(n);
                              }}
                            >
                              {n === 1 ? "One colour" : "Four colour"}
                            </Pick>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                          {slots === 1 ? "Spool colour" : "Spool colour per part"}
                        </span>
                        <div className="flex flex-col gap-2">
                          {Array.from({ length: slots }, (_, i) => (
                            <div key={i} className="flex items-center gap-2">
                              {slots > 1 && (
                                <span className="w-[9ch] shrink-0 text-[0.58rem] tracking-[0.1em] uppercase text-dim">
                                  {["plinth", "quiet", "busy", "peak"][i]}
                                </span>
                              )}
                              <div className="flex flex-wrap gap-1">
                                {SWATCHES.map((sw) => (
                                  <button
                                    key={sw.id}
                                    type="button"
                                    title={sw.name}
                                    aria-label={`${sw.name} for slot ${i + 1}`}
                                    onClick={() => {
                                      play("tick");
                                      setColours((prev) => {
                                        const next = [...prev];
                                        next[i] = sw.id;
                                        return next;
                                      });
                                    }}
                                    className={`h-5 w-5 rounded-full border transition-transform duration-150 active:scale-90 ${
                                      colours[i] === sw.id
                                        ? "border-accent ring-1 ring-accent"
                                        : "border-edge hover:border-mute"
                                    }`}
                                    style={{ background: sw.hex }}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <span className="text-[0.6rem] text-dim">
                          {Array.from({ length: slots }, (_, i) => swatchById(colours[i]).name).join(" · ")}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                          Ships from Germany to
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {SHIPPING.map((s) => (
                            <Pick
                              key={s.id}
                              active={shippingId === s.id}
                              onClick={() => {
                                play("step");
                                setShippingId(s.id);
                              }}
                            >
                              {s.name}
                            </Pick>
                          ))}
                        </div>
                      </div>

                      <label className="flex flex-col gap-2">
                        <span className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                          Where do we send it
                        </span>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@wherever.dev"
                          className="w-full border-b border-edge pb-2 text-[0.85rem] text-fog transition-colors duration-200 focus:border-accent"
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="rounded-lg border border-edge p-4">
                        <div className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                          What it costs us
                        </div>
                        <dl className="mt-3 flex flex-col gap-1.5 text-[0.72rem]">
                          {bill.lines.map((line) => (
                            <div key={line.label} className="flex justify-between gap-4">
                              <dt className="text-mute">
                                {line.label}
                                <span className="ml-2 text-dim">{line.detail}</span>
                              </dt>
                              <dd className="text-fog tabular-nums">{formatPrice(line.amount)}</dd>
                            </div>
                          ))}
                          <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2">
                            <dt className="text-mute">
                              Postage
                              <span className="ml-2 text-dim">{bill.shippingDetail}</span>
                            </dt>
                            <dd className="text-fog tabular-nums">{formatPrice(bill.shipping)}</dd>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2">
                            <dt className="tracking-[0.14em] uppercase text-dim">Total</dt>
                            <dd className="font-[family-name:var(--font-display)] text-[1.2rem] tabular-nums text-fog">
                              {formatPrice(bill.total)}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-[0.6rem] leading-relaxed text-dim">
                          That is the whole sum, with nothing added on top. It is also why we only
                          do this in small numbers. The file is the same object and costs nothing.
                        </p>
                      </div>

                      {error && <p className="text-[0.7rem] text-danger">{error}</p>}

                      <button
                        type="button"
                        onClick={checkout}
                        disabled={busy}
                        className="rounded-[5px] bg-accent px-4 py-3 text-[0.7rem] font-medium tracking-[0.12em] uppercase text-void transition-all duration-150 hover:brightness-110 active:scale-[0.985] disabled:opacity-60"
                      >
                        {busy ? "opening checkout" : `pay ${formatPrice(bill.total)}`}
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "done" && result && (
                  <motion.div
                    key="done"
                    className="relative flex flex-col items-center gap-4 pt-6 text-center"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 240, damping: 24 }}
                  >
                    <Confetti />
                    <div className="font-[family-name:var(--font-display)] text-[2rem] tracking-[-0.03em] text-accent">
                      {result.orderId}
                    </div>
                    <p className="max-w-[40ch] text-[0.75rem] leading-relaxed text-mute">
                      {result.demo
                        ? "Demo mode: the order is recorded, nothing was charged. Add STRIPE_SECRET_KEY to take real money."
                        : "On the plate. We will mail you when it ships."}
                    </p>
                    <a
                      href={result.url}
                      className="text-[0.66rem] tracking-[0.12em] uppercase text-accent transition-opacity duration-150 hover:opacity-70"
                    >
                      keep this link ↗
                    </a>
                    <a
                      href={PROJECT.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[0.6rem] tracking-[0.14em] uppercase text-dim transition-colors duration-150 hover:text-fog"
                    >
                      or star the repo, that one is free
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
