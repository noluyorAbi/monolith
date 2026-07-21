"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PRODUCTS, formatPrice, type Finish, type Product } from "@/lib/products";
import type { Variant } from "@/lib/types";
import { play } from "@/lib/sound";

const EASE = [0.32, 0.72, 0, 1] as const;
const SOFT = [0.16, 1, 0.3, 1] as const;

type Step = "pick" | "confirm" | "done";

/** Mobile keeps fixed sheet heights so the drag gesture has a stop to pull
 *  against. Wider screens let the content decide, which keeps every step a
 *  visibly different size instead of one tall empty box. */
const HEIGHTS: Record<Step, string> = {
  pick: "min(30rem, 74svh)",
  confirm: "min(34rem, 82svh)",
  done: "min(22rem, 58svh)",
};

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

function Card({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors duration-200 active:scale-[0.99] ${
        selected ? "border-accent bg-accent/[0.06]" : "border-edge hover:border-mute"
      }`}
    >
      {product.featured && (
        <span className="absolute right-3 top-3 text-[0.5rem] tracking-[0.2em] uppercase text-accent">
          most ordered
        </span>
      )}
      <div>
        <div className="font-[family-name:var(--font-display)] text-[1.05rem] tracking-[-0.01em] text-fog">
          {product.name}
        </div>
        <div className="mt-0.5 text-[0.68rem] leading-snug text-mute">{product.tagline}</div>
      </div>
      <div className="text-[0.6rem] tracking-[0.14em] uppercase text-dim">{product.material}</div>
      <ul className="flex flex-col gap-1">
        {product.perks.map((p) => (
          <li key={p} className="flex gap-2 text-[0.66rem] text-mute">
            <span className="text-dim">—</span>
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-baseline justify-between pt-1">
        <span className="font-[family-name:var(--font-display)] text-[1.1rem] tabular-nums text-fog">
          {formatPrice(product.price)}
        </span>
        <span className="text-[0.58rem] tracking-[0.14em] uppercase text-dim">{product.lead}</span>
      </div>
    </button>
  );
}

export interface OrderSheetProps {
  open: boolean;
  onClose: () => void;
  login: string;
  year: number;
  variant: Variant;
  finish: Finish;
}

export function OrderSheet({ open, onClose, login, year, variant, finish }: OrderSheetProps) {
  const [step, setStep] = useState<Step>("pick");
  const [product, setProduct] = useState<Product>(PRODUCTS[1]);
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
    if (open) {
      setStep("pick");
      setResult(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login,
          year,
          variant,
          finish: finish.id,
          productId: product.id,
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

  const summary = `${login} · ${year} · ${variant} · ${finish.name} · ${product.sizeMm}mm`;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-void/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Order your monolith"
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-edge bg-ink"
            style={{ maxHeight: "90svh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0, height: wide ? "auto" : HEIGHTS[step] }}
            exit={{ y: "100%" }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 420) onClose();
            }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="flex items-center justify-between px-5 pt-4 sm:px-7">
              <div className="mx-auto h-1 w-9 rounded-full bg-edge sm:hidden" />
            </div>

            <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4 px-5 pb-4 pt-3 sm:px-7">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-[1.15rem] tracking-[-0.02em] text-fog">
                  {step === "done" ? "Order placed" : step === "confirm" ? product.name : "Take it off the screen"}
                </h3>
                <p className="mt-1 text-[0.66rem] tracking-[0.1em] uppercase text-dim">{summary}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hairline grid h-7 w-7 shrink-0 place-items-center rounded-[5px] text-mute transition-colors duration-150 hover:text-fog active:scale-[0.95]"
              >
                ✕
              </button>
            </div>

            <div className="relative mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-5 pb-7 sm:px-7">
              <AnimatePresence mode="wait" initial={false}>
                {step === "pick" && (
                  <motion.div
                    key="pick"
                    className="grid gap-3 sm:grid-cols-3"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.28, ease: SOFT }}
                  >
                    {PRODUCTS.map((p) => (
                      <Card
                        key={p.id}
                        product={p}
                        selected={product.id === p.id}
                        onSelect={() => {
                          play("lock");
                          setProduct(p);
                          setStep("confirm");
                        }}
                      />
                    ))}
                  </motion.div>
                )}

                {step === "confirm" && (
                  <motion.div
                    key="confirm"
                    className="flex flex-col gap-5"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.28, ease: SOFT }}
                  >
                    <div className="flex flex-col gap-2 border-y border-line py-4 text-[0.72rem]">
                      {[
                        ["Object", `${login} ${year}`],
                        ["Form", variant],
                        ["Finish", finish.name],
                        ["Material", product.material],
                        ["Size", `${product.sizeMm}mm`],
                        ["Lead time", product.lead],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4">
                          <span className="tracking-[0.12em] uppercase text-dim">{k}</span>
                          <span className="text-right text-fog">{v}</span>
                        </div>
                      ))}
                    </div>

                    <label className="flex flex-col gap-2">
                      <span className="text-[0.58rem] tracking-[0.2em] uppercase text-dim">
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

                    {error && <p className="text-[0.7rem] text-danger">{error}</p>}

                    <div className="mt-auto flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          play("tick");
                          setStep("pick");
                        }}
                        className="hairline rounded-[5px] px-3 py-2.5 text-[0.66rem] tracking-[0.12em] uppercase text-mute transition-colors duration-150 hover:text-fog active:scale-[0.97]"
                      >
                        ← back
                      </button>
                      <button
                        type="button"
                        onClick={checkout}
                        disabled={busy}
                        className="flex-1 rounded-[5px] bg-accent px-4 py-2.5 text-[0.7rem] font-medium tracking-[0.12em] uppercase text-void transition-all duration-150 hover:brightness-110 active:scale-[0.985] disabled:opacity-60"
                      >
                        {busy ? "opening checkout" : `pay ${formatPrice(product.price)}`}
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
                    <p className="max-w-[36ch] text-[0.75rem] leading-relaxed text-mute">
                      {result.demo
                        ? "Demo mode: the order is recorded, nothing was charged. Add STRIPE_SECRET_KEY to take real money."
                        : `We are casting it. ${product.lead.toLowerCase()}.`}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <a
                        href={`/api/stl?login=${encodeURIComponent(login)}&year=${year}&variant=${variant}&mm=${product.sizeMm}`}
                        download
                        className="hairline rounded-[5px] px-4 py-2.5 text-[0.66rem] tracking-[0.12em] uppercase text-fog transition-colors duration-150 hover:border-mute active:scale-[0.97]"
                      >
                        download production stl
                      </a>
                      <a
                        href={result.url}
                        className="text-[0.66rem] tracking-[0.12em] uppercase text-accent transition-opacity duration-150 hover:opacity-70"
                      >
                        keep this link ↗
                      </a>
                    </div>
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
