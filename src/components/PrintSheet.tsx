"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import {
  DEFAULT_MATERIAL_ID,
  DEFAULT_QUALITY_ID,
  MATERIALS,
  MIN_TOWER_GAP_MM,
  NOZZLE_LINE_MM,
  PRINTERS,
  QUALITIES,
  estimate,
  fitsBed,
  formatPrice,
  materialById,
  overrides,
  printerById,
  qualityById,
} from "@/lib/print";
import { modelQuery, buildBambuLink } from "@/lib/request";
import { SLOT_CHOICES, type ColourSlots } from "@/lib/slots";
import { printableParts } from "@/lib/parts";
import { PROJECT } from "@/lib/project";
import type { BuiltMesh, Variant } from "@/lib/types";
import { play } from "@/lib/sound";
import { useMediaQuery } from "@/lib/useMediaQuery";

const EASE = [0.32, 0.72, 0, 1] as const;
const SOFT = [0.16, 1, 0.3, 1] as const;

function Choice({
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
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 rounded-[5px] border px-3 py-1.5 text-[0.68rem] tracking-[0.08em] transition-colors duration-150 active:scale-[0.97] sm:min-h-0 sm:px-2.5 ${
        active ? "border-accent bg-accent/[0.08] text-fog" : "border-edge text-mute hover:text-fog"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export interface PrintSheetProps {
  open: boolean;
  onClose: () => void;
  login: string;
  year: number;
  variant: Variant;
  sizeMm: number;
  mesh: BuiltMesh;
  printerId: string;
  onPrinter: (id: string) => void;
}

export function PrintSheet(props: PrintSheetProps) {
  const { printerId, setPrinterId } = { printerId: props.printerId, setPrinterId: props.onPrinter };
  const [materialId, setMaterialId] = useState(DEFAULT_MATERIAL_ID);
  const [qualityId, setQualityId] = useState(DEFAULT_QUALITY_ID);
  const [slots, setSlots] = useState<ColourSlots>(1);
  const [copiedCard, setCopiedCard] = useState(false);
  const wide = useMediaQuery("(min-width: 640px)");
  /**
   * Swipe to dismiss, from the handle only. A drag listener on the whole sheet
   * makes Motion set touch-action on it, which on a phone took the vertical
   * gesture away from the list of choices inside and left the sheet unable to
   * scroll to its own download button.
   */
  const drag = useDragControls();

  const { open, onClose } = props;
  const dialogRef = useRef<HTMLDivElement>(null);

  /**
   * aria-modal tells assistive tech to ignore everything outside this dialog,
   * so focus has to actually be inside it. Focus moves in on open, Tab is kept
   * within, and the trigger gets focus back on close.
   */
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open, onClose]);

  const printer = printerById(printerId);
  const material = materialById(materialId);
  const quality = qualityById(qualityId);

  // Only while the sheet is open. This welds the whole object, and the dialog
  // stays mounted for the entire live phase, so ungated it would re-run on
  // every form and size change during the reveal animation.
  const parts = useMemo(
    () => (open ? printableParts(props.mesh) : null),
    [open, props.mesh],
  );
  const est = useMemo(
    () => (parts ? estimate(parts, material, quality, printer) : null),
    [parts, material, quality, printerId],
  );
  const specs = useMemo(() => overrides(material, quality), [material, quality]);

  const query = modelQuery({
    login: props.login,
    year: props.year,
    variant: props.variant,
    sizeMm: props.sizeMm,
    printerId,
    materialId,
    qualityId,
    slots,
  });

  const fits = fitsBed(props.mesh.size, printer);

  /**
   * Bambu Studio registers bambustudioopen: on install, which is how the
   * "open in" buttons on model sites work. Verified against the app's own
   * Info.plist; bambustudio: resolves to nothing.
   *
   * Built when clicked rather than during render: it needs an absolute URL,
   * because Bambu fetches the model itself, and the origin is only knowable in
   * the browser.
   */
  function openInBambu() {
    play("lock");
    // The only external-app launch in the app. buildBambuLink refuses any
    // origin that is not a clean http(s) URL, so this can never hand a local
    // path or a `file:`/`javascript:` scheme to Bambu Studio. F0.
    const link = buildBambuLink(window.location.origin, query, props.login, props.year);
    window.location.assign(link);
  }

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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Print it yourself"
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-edge bg-ink"
            style={{ maxHeight: "92svh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0, height: wide ? "auto" : "min(40rem, 90svh)" }}
            exit={{ y: "100%" }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 420) props.onClose();
            }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div
              onPointerDown={(e) => drag.start(e)}
              className="flex touch-none items-center justify-between px-5 pt-4 sm:px-7"
            >
              <div className="mx-auto h-1 w-9 rounded-full bg-edge sm:hidden" />
            </div>

            <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4 px-5 pb-4 pt-3 sm:px-7">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-[1.15rem] tracking-[-0.02em] text-fog">
                  Print it yourself
                </h3>
                <p className="mt-1 text-[0.66rem] tracking-[0.1em] uppercase text-dim">
                  {props.login} · {props.year} · {props.variant} · {props.sizeMm}mm · free forever
                </p>
              </div>
              <button
                type="button"
                onClick={props.onClose}
                aria-label="Close"
                className="hairline grid h-9 w-9 shrink-0 place-items-center rounded-[5px] text-mute sm:h-7 sm:w-7 transition-colors duration-150 hover:text-fog active:scale-[0.95]"
              >
                ✕
              </button>
            </div>

            <div className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-5 pb-7 sm:px-7">
              <motion.div
                className="grid gap-6 sm:grid-cols-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: SOFT }}
              >
                <div className="flex flex-col gap-5">
                  <Row label="Printer">
                    {PRINTERS.map((p) => (
                      <Choice
                        key={p.id}
                        active={printerId === p.id}
                        onClick={() => {
                          play("step");
                          setPrinterId(p.id);
                        }}
                      >
                        {p.name.replace("Bambu Lab ", "")}
                      </Choice>
                    ))}
                  </Row>

                  <Row label="Filament">
                    {MATERIALS.map((m) => (
                      <Choice
                        key={m.id}
                        active={materialId === m.id}
                        title={m.note}
                        onClick={() => {
                          play("step");
                          setMaterialId(m.id);
                        }}
                      >
                        {m.name}
                      </Choice>
                    ))}
                  </Row>

                  <Row label="Quality">
                    {QUALITIES.map((q) => (
                      <Choice
                        key={q.id}
                        active={qualityId === q.id}
                        title={q.note}
                        onClick={() => {
                          play("step");
                          setQualityId(q.id);
                        }}
                      >
                        {q.name} · {q.layerHeightMm.toFixed(2)}
                      </Choice>
                    ))}
                  </Row>

                  <Row label="Colours">
                    {SLOT_CHOICES.map((c) => (
                      <Choice
                        key={c.slots}
                        active={slots === c.slots}
                        title={c.note}
                        onClick={() => {
                          play("step");
                          setSlots(c.slots);
                        }}
                      >
                        {c.name}
                      </Choice>
                    ))}
                  </Row>

                  <div className="flex flex-col gap-1.5 border-t border-line pt-4 text-[0.72rem]">
                    {est && [
                      ["Filament", `about ${est.grams.toFixed(0)} g`],
                      ["Print time", `${est.hoursLow.toFixed(1)} to ${est.hoursHigh.toFixed(1)} h`],
                      ["Filament cost", formatPrice(est.filamentCost)],
                      ["Engraved pixel", `${props.mesh.print.engravePixelMm.toFixed(2)} mm`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <span className="tracking-[0.12em] uppercase text-dim">{k}</span>
                        <span className="text-fog tabular-nums">{v}</span>
                      </div>
                    ))}
                    <p className="mt-1 text-[0.6rem] leading-relaxed text-dim">
                      Estimated from the geometry and calibrated against real Bambu Studio slices of
                      this exact model. Treat it as a band.
                    </p>
                    {props.mesh.print.engravePixelMm > 0 &&
                      props.mesh.print.engravePixelMm < NOZZLE_LINE_MM && (
                        <p className="mt-1 text-[0.66rem] leading-relaxed text-danger">
                          At {props.sizeMm} mm the engraved handle is{" "}
                          {props.mesh.print.engravePixelMm.toFixed(2)} mm per pixel, under the{" "}
                          {NOZZLE_LINE_MM} mm line a 0.4 mm nozzle lays down. It will come out
                          faint. 180 mm or larger reads properly.
                        </p>
                      )}
                    {props.mesh.print.gapMm !== null && props.mesh.print.gapMm < MIN_TOWER_GAP_MM && (
                      <p className="mt-1 text-[0.66rem] leading-relaxed text-danger">
                        Towers sit {props.mesh.print.gapMm.toFixed(2)} mm apart, under one nozzle
                        width. They will fuse at the base.
                      </p>
                    )}
                    {!fits && (
                      <p className="mt-1 text-[0.66rem] leading-relaxed text-danger">
                        {props.sizeMm} mm will not fit a {printer.name} ({printer.bedMm[0]} ×{" "}
                        {printer.bedMm[1]} mm). Pick a smaller size or another machine.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-edge p-4">
                    <div className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                      Baked into the file
                    </div>
                    <dl className="mt-3 flex flex-col gap-2">
                      {specs.map((s) => (
                        <div key={s.key} className="flex flex-col gap-0.5">
                          <div className="flex justify-between gap-4 text-[0.7rem]">
                            <dt className="text-mute">{s.label}</dt>
                            <dd className="text-right text-fog">{s.value}</dd>
                          </div>
                          <p className="text-[0.6rem] leading-snug text-dim">{s.why}</p>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="flex flex-col gap-2">
                    {/* Narrow, this button lives in the bar pinned to the
                      bottom of the sheet instead, so it is reachable without
                      scrolling past four rows of choices to find it. */}
                    <a
                      href={`/api/kit?${query}`}
                      download
                      onClick={() => play("lock")}
                      className="hidden rounded-[5px] bg-accent px-4 py-3 text-center text-[0.7rem] font-medium tracking-[0.12em] uppercase text-void transition-all duration-150 hover:brightness-110 active:scale-[0.985] sm:block"
                    >
                      Download print kit · zip
                    </a>
                    <p className="text-[0.6rem] leading-relaxed text-dim">
                      3MF split into one part per intensity, the same object as STL, a Bambu and
                      Orca preset that inherits from your stock profile, and a text card with every
                      setting and why.
                    </p>
                    <button
                      type="button"
                      onClick={openInBambu}
                      className="hairline flex items-center justify-center gap-2 rounded-[5px] px-4 py-2.5 text-center text-[0.68rem] tracking-[0.12em] uppercase text-fog transition-colors duration-150 hover:border-mute active:scale-[0.98]"
                    >
                      Open in Bambu Studio
                      <span aria-hidden className="text-dim">↗</span>
                    </button>
                    <p className="-mt-1 text-[0.58rem] leading-relaxed text-dim">
                      Hands the model straight to Bambu Studio if you have it installed. The
                      preset is not part of that handoff, so import it once from the kit.
                    </p>
                    <div className="mt-1 flex gap-2">
                      <a
                        href={`/api/3mf?${query}`}
                        download
                        onClick={() => play("tick")}
                        className="hairline flex-1 rounded-[5px] px-3 py-2 text-center text-[0.66rem] tracking-[0.12em] uppercase text-fog transition-colors duration-150 hover:border-mute active:scale-[0.97]"
                      >
                        .3mf only
                      </a>
                      <a
                        href={`/api/stl?${query}`}
                        download
                        onClick={() => play("tick")}
                        className="hairline flex-1 rounded-[5px] px-3 py-2 text-center text-[0.66rem] tracking-[0.12em] uppercase text-fog transition-colors duration-150 hover:border-mute active:scale-[0.97]"
                      >
                        .stl only
                      </a>
                    </div>
                    {/* F2: the one distribution surface whose value grows on its
                      own. A README embed re-renders on every profile view
                      forever, so we hand the visitor the exact snippet to paste. */}
                    <div className="mt-3 rounded-lg border border-edge p-3">
                      <div className="mb-1.5 text-[0.55rem] tracking-[0.22em] uppercase text-dim">
                        Embed in a README
                      </div>
                      <p className="text-[0.6rem] leading-relaxed text-dim">
                        Paste this into your profile README. It re-renders every time someone
                        visits, with the object you just built.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const snippet = `![${props.login}'s ${props.year} on MONOLITH](https://monolith.adatepe.dev/api/card/${props.login}?variant=${props.variant}&mm=${props.sizeMm}&year=${props.year})`;
                          navigator.clipboard?.writeText(snippet).then(
                            () => {
                              play("lock");
                              setCopiedCard(true);
                              setTimeout(() => setCopiedCard(false), 1800);
                            },
                            () => play("error"),
                          );
                        }}
                        className="hairline mt-2 w-full rounded-[5px] bg-ink px-3 py-2 text-left font-mono text-[0.6rem] text-fog transition-colors duration-150 hover:border-mute active:scale-[0.99]"
                        title="Copy the markdown snippet"
                      >
                        {copiedCard ? "✓ copied to clipboard" : `![...](${window.location.origin}/api/card/${props.login}?variant=${props.variant}&mm=${props.sizeMm}&year=${props.year})`}
                      </button>
                    </div>
                    {/* F8: one object, every workflow. The same footprint that
                      prints also drops into Blender, Fusion or a three.js scene
                      with vertex colours intact, no converter. */}
                    <a
                      href={`/api/glb?${query}`}
                      download
                      onClick={() => play("tick")}
                      className="hairline mt-3 block w-full rounded-[5px] px-3 py-2 text-center text-[0.66rem] tracking-[0.12em] uppercase text-fog transition-colors duration-150 hover:border-mute active:scale-[0.97]"
                    >
                      .glb (open in any 3D app)
                    </a>
                    <div className="mt-2 flex items-center justify-center gap-4 text-[0.6rem] tracking-[0.14em] uppercase text-mute">
                      <a
                        href={PROJECT.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="transition-colors duration-150 hover:text-fog"
                      >
                        source on github ↗
                      </a>
                      {/* The maker's link, which the narrow header drops. */}
                      <a
                        href={PROJECT.authorSite}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="transition-colors duration-150 hover:text-fog sm:hidden"
                      >
                        by {PROJECT.authorSiteName} ↗
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* The one action this sheet exists for, held at the bottom of a
              phone screen rather than at the bottom of its scroll. */}
            <div className="shrink-0 border-t border-line bg-ink px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
              <a
                href={`/api/kit?${query}`}
                download
                onClick={() => play("lock")}
                className="block rounded-[5px] bg-accent px-4 py-3.5 text-center text-[0.7rem] font-medium tracking-[0.12em] uppercase text-void transition-all duration-150 active:scale-[0.985]"
              >
                Download print kit · zip
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
