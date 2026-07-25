"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHANNEL_STATUSES,
  WAVES,
  type Channel,
  type ChannelStatus,
  type LaunchState,
  type Metric,
  type Task,
  type Wave,
} from "@/lib/admin/model";
import { Area, Choice, Copy, Label, Text } from "./ui";

/**
 * The launch board.
 *
 * One operator, one browser, no collaboration: that is what lets this be a
 * single state object saved whole on a debounce rather than a set of endpoints
 * per field. Saving is automatic because the failure mode of a manual save
 * button here is losing an evening of post copy, and the failure mode of an
 * automatic one is an extra write.
 */

type SaveState = "idle" | "saving" | "saved" | "error";

const STATUS_OPTIONS = CHANNEL_STATUSES.map((id) => ({ id, name: id }));
const WAVE_OPTIONS = WAVES.map((id) => ({ id, name: `wave ${id}` }));

/** Only "posted" earns the accent. Everything else is structure, not signal. */
const STATUS_TONE: Record<ChannelStatus, string> = {
  todo: "text-dim",
  ready: "text-fog",
  scheduled: "text-mute",
  posted: "text-accent",
  skipped: "text-line line-through",
};

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  saving: "saving",
  saved: "saved",
  error: "not saved",
};

export default function Board({
  initial,
  backend,
}: {
  initial: LaunchState;
  backend: "blob" | "file";
}) {
  const [state, setState] = useState<LaunchState>(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [tab, setTab] = useState<"channels" | "tasks" | "metrics" | "data">("channels");

  // The first render must not write. Without this the panel saves the state it
  // just loaded, which rewrites `updatedAt` every time the page is opened.
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) return;
    setSave("saving");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(state),
        });
        setSave(response.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [state]);

  const edit = useCallback((next: (previous: LaunchState) => LaunchState) => {
    dirty.current = true;
    setState(next);
  }, []);

  return (
    <div className="min-h-dvh field">
      <header className="sticky top-0 z-10 border-b border-line bg-void/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="font-[var(--font-display)] text-[13px] font-bold tracking-[0.2em] text-fog">
            LAUNCH
          </span>
          <nav className="flex gap-1">
            {(["channels", "tasks", "metrics", "data"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded px-2 py-1 text-[11px] transition-colors duration-150 ${
                  tab === id ? "bg-accent text-void" : "text-mute hover:text-fog"
                }`}
              >
                {id}
              </button>
            ))}
          </nav>
          <span className="ml-auto flex items-center gap-3">
            <span
              className={`text-[10px] uppercase tracking-[0.14em] ${
                save === "error" ? "text-danger" : "text-dim"
              }`}
            >
              {SAVE_LABEL[save]}
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-dim">{backend}</span>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/admin/session", { method: "DELETE" });
                location.reload();
              }}
              className="text-[10px] uppercase tracking-[0.14em] text-dim hover:text-fog"
            >
              lock
            </button>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === "channels" ? <Channels state={state} edit={edit} /> : null}
        {tab === "tasks" ? <Tasks state={state} edit={edit} /> : null}
        {tab === "metrics" ? <Metrics state={state} edit={edit} /> : null}
        {tab === "data" ? <Data state={state} edit={edit} /> : null}
      </main>
    </div>
  );
}

type Edit = (next: (previous: LaunchState) => LaunchState) => void;

function Channels({ state, edit }: { state: LaunchState; edit: Edit }) {
  const [open, setOpen] = useState<string | null>(null);
  const [wave, setWave] = useState<Wave | "all">("all");

  const shown = useMemo(
    () => state.channels.filter((channel) => wave === "all" || channel.wave === wave),
    [state.channels, wave],
  );

  const counts = useMemo(() => {
    const tally = { posted: 0, ready: 0, todo: 0 };
    for (const channel of state.channels) {
      if (channel.status === "posted") tally.posted += 1;
      else if (channel.status === "ready" || channel.status === "scheduled") tally.ready += 1;
      else if (channel.status === "todo") tally.todo += 1;
    }
    return tally;
  }, [state.channels]);

  const patch = (id: string, change: Partial<Channel>) =>
    edit((previous) => ({
      ...previous,
      channels: previous.channels.map((c) => (c.id === id ? { ...c, ...change } : c)),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["all", ...WAVES] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setWave(id as Wave | "all")}
              className={`rounded px-2 py-1 text-[11px] transition-colors duration-150 ${
                wave === id ? "bg-accent text-void" : "border border-line text-mute hover:text-fog"
              }`}
            >
              {id === "all" ? "all" : `wave ${id}`}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-3 text-[11px] tabular-nums text-dim">
          <span className="text-accent">{counts.posted} posted</span>
          <span>{counts.ready} ready</span>
          <span>{counts.todo} to write</span>
        </span>
      </div>

      <ul className="flex flex-col gap-px overflow-hidden rounded border border-line">
        {shown.map((channel) => {
          const expanded = open === channel.id;
          return (
            <li key={channel.id} className="bg-ink">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : channel.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-void"
              >
                <span className={`text-[11px] tabular-nums ${STATUS_TONE[channel.status]}`}>
                  {channel.status === "posted" ? "●" : "○"}
                </span>
                <span className="text-[13px] text-fog">{channel.name || "untitled"}</span>
                <span className="text-[11px] text-dim">{channel.group}</span>
                <span className="ml-auto flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-dim">
                  {channel.scheduledAt ? <span className="tabular-nums">{channel.scheduledAt}</span> : null}
                  <span>w{channel.wave}</span>
                </span>
              </button>

              {expanded ? (
                <div className="flex flex-col gap-4 border-t border-line px-3 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Text label="name" value={channel.name} onChange={(name) => patch(channel.id, { name })} />
                    <Text label="group" value={channel.group} onChange={(group) => patch(channel.id, { group })} />
                    <Text
                      label="where to post"
                      value={channel.url}
                      onChange={(url) => patch(channel.id, { url })}
                      placeholder="https://"
                    />
                    <Text
                      label="scheduled"
                      value={channel.scheduledAt}
                      onChange={(scheduledAt) => patch(channel.id, { scheduledAt })}
                      placeholder="2026-07-29"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Choice
                      label="status"
                      value={channel.status}
                      options={STATUS_OPTIONS}
                      onChange={(status) => patch(channel.id, { status })}
                    />
                    <Choice
                      label="wave"
                      value={channel.wave}
                      options={WAVE_OPTIONS}
                      onChange={(w) => patch(channel.id, { wave: w })}
                    />
                  </div>

                  {channel.rules ? (
                    <div className="rounded border border-line bg-void px-3 py-2">
                      <Label>rules that get you removed</Label>
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-mute">
                        {channel.rules}
                      </p>
                    </div>
                  ) : null}

                  <Text
                    label="title or subject"
                    value={channel.title}
                    onChange={(title) => patch(channel.id, { title })}
                    copy
                  />
                  <Area
                    label="post body"
                    value={channel.body}
                    onChange={(body) => patch(channel.id, { body })}
                    rows={8}
                  />
                  <Area
                    label="rules"
                    value={channel.rules}
                    onChange={(rules) => patch(channel.id, { rules })}
                    rows={2}
                  />
                  <Area
                    label="notes"
                    value={channel.notes}
                    onChange={(notes) => patch(channel.id, { notes })}
                    rows={2}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Text
                      label="link to the live post"
                      value={channel.postedUrl}
                      onChange={(postedUrl) => patch(channel.id, { postedUrl })}
                      placeholder="https://"
                    />
                    <Text
                      label="what it did"
                      value={channel.result}
                      onChange={(result) => patch(channel.id, { result })}
                      placeholder="42 points, 12 comments"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Copy value={`${channel.title}\n\n${channel.body}`} label="copy title and body" />
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(null);
                        edit((previous) => ({
                          ...previous,
                          channels: previous.channels.filter((c) => c.id !== channel.id),
                        }));
                      }}
                      className="ml-auto rounded px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-dim hover:text-danger"
                    >
                      delete
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="bg-ink px-3 py-6 text-center text-[12px] text-dim">
            nothing in this wave yet
          </li>
        ) : null}
      </ul>

      <button
        type="button"
        onClick={() =>
          edit((previous) => ({
            ...previous,
            channels: [
              ...previous.channels,
              {
                id: crypto.randomUUID(),
                name: "",
                group: "",
                url: "",
                wave: wave === "all" ? 1 : wave,
                status: "todo",
                scheduledAt: "",
                postedUrl: "",
                rules: "",
                title: "",
                body: "",
                notes: "",
                result: "",
              },
            ],
          }))
        }
        className="self-start rounded border border-line px-3 py-2 text-[11px] text-mute transition-colors duration-150 hover:border-edge hover:text-fog"
      >
        add channel
      </button>
    </div>
  );
}

function Tasks({ state, edit }: { state: LaunchState; edit: Edit }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    edit((previous) => ({
      ...previous,
      tasks: [...previous.tasks, { id: crypto.randomUUID(), text, done: false, due: "" }],
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-px overflow-hidden rounded border border-line">
        {state.tasks.map((task: Task) => (
          <li key={task.id} className="flex items-center gap-3 bg-ink px-3 py-2">
            <button
              type="button"
              onClick={() =>
                edit((previous) => ({
                  ...previous,
                  tasks: previous.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
                }))
              }
              className={`text-[12px] ${task.done ? "text-accent" : "text-dim hover:text-fog"}`}
              aria-label={task.done ? "mark as open" : "mark as done"}
            >
              {task.done ? "●" : "○"}
            </button>
            <span className={`text-[13px] ${task.done ? "text-dim line-through" : "text-fog"}`}>
              {task.text}
            </span>
            <input
              value={task.due}
              placeholder="due"
              onChange={(event) =>
                edit((previous) => ({
                  ...previous,
                  tasks: previous.tasks.map((t) =>
                    t.id === task.id ? { ...t, due: event.target.value } : t,
                  ),
                }))
              }
              className="ml-auto w-24 text-right text-[11px] tabular-nums text-dim"
            />
            <button
              type="button"
              onClick={() =>
                edit((previous) => ({
                  ...previous,
                  tasks: previous.tasks.filter((t) => t.id !== task.id),
                }))
              }
              className="text-[10px] uppercase tracking-[0.14em] text-dim hover:text-danger"
            >
              x
            </button>
          </li>
        ))}
        {state.tasks.length === 0 ? (
          <li className="bg-ink px-3 py-6 text-center text-[12px] text-dim">no tasks</li>
        ) : null}
      </ul>

      <div className="flex gap-2">
        <input
          value={draft}
          placeholder="what has to be true before the post goes out"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          className="flex-1 rounded border border-line bg-ink px-3 py-2 text-[13px] focus:border-edge"
        />
        <button
          type="button"
          onClick={add}
          className="rounded border border-line px-3 py-2 text-[11px] text-mute hover:border-edge hover:text-fog"
        >
          add
        </button>
      </div>
    </div>
  );
}

function Metrics({ state, edit }: { state: LaunchState; edit: Edit }) {
  const rows = useMemo(
    () => [...state.metrics].sort((a, b) => (a.at < b.at ? 1 : -1)),
    [state.metrics],
  );

  const patch = (id: string, change: Partial<Metric>) =>
    edit((previous) => ({
      ...previous,
      metrics: previous.metrics.map((m) => (m.id === id ? { ...m, ...change } : m)),
    }));

  const cell =
    "bg-transparent px-2 py-2 text-right text-[12px] tabular-nums text-fog focus:text-accent";

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full overflow-hidden rounded border border-line">
        <thead>
          <tr className="bg-ink text-left">
            {["date", "stars", "visitors", "kits", "note", ""].map((head) => (
              <th
                key={head}
                className="px-2 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-dim"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((metric) => (
            <tr key={metric.id} className="border-t border-line bg-ink">
              <td>
                <input
                  value={metric.at}
                  onChange={(event) => patch(metric.id, { at: event.target.value })}
                  className="w-28 bg-transparent px-2 py-2 text-[12px] tabular-nums text-mute"
                />
              </td>
              {(["stars", "visitors", "kits"] as const).map((key) => (
                <td key={key}>
                  <input
                    value={metric[key] || ""}
                    inputMode="numeric"
                    onChange={(event) => patch(metric.id, { [key]: Number(event.target.value) || 0 })}
                    className={`w-20 ${cell}`}
                  />
                </td>
              ))}
              <td className="w-full">
                <input
                  value={metric.note}
                  onChange={(event) => patch(metric.id, { note: event.target.value })}
                  className="w-full bg-transparent px-2 py-2 text-[12px] text-mute"
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() =>
                    edit((previous) => ({
                      ...previous,
                      metrics: previous.metrics.filter((m) => m.id !== metric.id),
                    }))
                  }
                  className="px-2 text-[10px] uppercase tracking-[0.14em] text-dim hover:text-danger"
                >
                  x
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        onClick={() =>
          edit((previous) => ({
            ...previous,
            metrics: [
              ...previous.metrics,
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString().slice(0, 10),
                stars: 0,
                visitors: 0,
                kits: 0,
                note: "",
              },
            ],
          }))
        }
        className="self-start rounded border border-line px-3 py-2 text-[11px] text-mute hover:border-edge hover:text-fog"
      >
        add reading
      </button>
    </div>
  );
}

/**
 * Import and export.
 *
 * This is how the board is seeded without the seed ever entering the
 * repository: write the JSON locally, paste it in here once against the
 * production panel. It is also the backup, which a single-blob store with no
 * history otherwise does not have.
 */
function Data({ state, edit }: { state: LaunchState; edit: Edit }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const serialised = useMemo(() => JSON.stringify(state, null, 2), [state]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="flex items-center justify-between">
          <Label>export</Label>
          <Copy value={serialised} label="copy everything" />
        </span>
        <p className="text-[12px] text-mute">
          {state.channels.length} channels, {state.tasks.length} tasks, {state.metrics.length}{" "}
          readings. Last saved {state.updatedAt || "never"}.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Area
          label="import (replaces everything)"
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setError("");
          }}
          rows={8}
          placeholder="paste a board export"
        />
        {error ? <span className="text-[11px] text-danger">{error}</span> : null}
        <button
          type="button"
          onClick={() => {
            try {
              const parsed = JSON.parse(draft) as LaunchState;
              edit(() => parsed);
              setDraft("");
            } catch {
              setError("that is not valid json");
            }
          }}
          className="self-start rounded border border-line px-3 py-2 text-[11px] text-mute hover:border-edge hover:text-fog"
        >
          replace board
        </button>
      </div>
    </div>
  );
}
