"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The panel's shared parts.
 *
 * They exist because the board is mostly one interaction repeated: a labelled
 * piece of text you edit and then paste somewhere else. Every field therefore
 * carries its own copy button rather than expecting a select-all drag, which
 * is the difference between a document and a tool.
 */

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-dim">{children}</span>
  );
}

/** Copies its payload and says so for a moment. The tick is the whole feedback. */
export function Copy({ value, label = "copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          return;
        }
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1400);
      }}
      className={`rounded px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 ${
        done ? "text-accent" : "text-dim hover:text-fog"
      }`}
    >
      {done ? "copied" : label}
    </button>
  );
}

export function Text({
  label,
  value,
  onChange,
  placeholder,
  mono = true,
  copy = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between">
        <Label>{label}</Label>
        {copy ? <Copy value={value} /> : null}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded border border-line bg-ink px-3 py-2 text-[13px] text-fog transition-colors duration-150 focus:border-edge ${
          mono ? "" : "font-[var(--font-display)]"
        }`}
      />
    </label>
  );
}

/**
 * Grows with its content up to a ceiling. A post body is between three lines
 * and forty, and a fixed box either wastes the screen or hides the end of the
 * text you are about to paste into a thread you cannot edit afterwards.
 */
export function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 640)}px`;
  }, [value]);

  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="flex items-center gap-2">
          {value ? <span className="text-[10px] tabular-nums text-dim">{value.length}</span> : null}
          <Copy value={value} />
        </span>
      </span>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded border border-line bg-ink px-3 py-2 text-[13px] leading-relaxed text-fog transition-colors duration-150 focus:border-edge"
      />
    </label>
  );
}

/**
 * A custom select. The native one renders an operating-system menu that cannot
 * be styled, and on a dark panel that lands as a white rectangle.
 */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; name: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`rounded px-2 py-1 text-[11px] transition-colors duration-150 ${
                active
                  ? "bg-accent text-void"
                  : "border border-line text-mute hover:border-edge hover:text-fog"
              }`}
            >
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
