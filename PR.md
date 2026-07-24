# Opt-in extras: engravings, share images, starsign surfaces

Branch: `feat/opt-in-extras` → `main`

## TL;DR

Every new capability is an opt-in (or opt-out) switch; a link or object built
before this branch stays byte-identical. One `flags` parameter joins the share
contract, the Dock grows an Extras group, and the starsign system gains the
surfaces people actually share.

## Features

**Flags contract.** `flags=` carries comma-separated opt-in tokens (canonical
order, unknown tokens dropped, absent by default). `sign=` carries the sign id
the page showed, so downloads engrave the hour-refined reading the server
cannot re-derive. All four export routes build via one shared
`buildOptionsFrom` helper. The URL tracks toggles live.

**Starsign engraving (flag `sigil`).** The persona's constellation, stars as
dots and edges as strings of beads (printable at any angle; a star chart draws
figures dotted anyway), plus the sign's name, raised out of the plate's back
wall. Works on skyline, wave and every multi-year shared plate; inert on
ring/spine, whose walls are already spoken for.

**Peak-day engraving (flag `peak`).** "PEAK 47 - 9 FEB" on the plate's front
wall, reading across all years of a stack. (The original idea, the date on top
of the tallest tower, dies on physics: a 2.8 mm tower top cannot carry legible
5x7 text at a 0.4 mm nozzle.)

**OG preview image.** `/api/og` renders a 1200x630 PNG (handle, stats,
starsign, weekly skyline silhouette) speaking the full share contract:
lifetime, range and repo links unfurl as the window they show. The share
page's metadata points at it; flag `noog` opts out.

**Starsign share card.** `/api/sign` renders the reading as a 1080x1080 PNG:
constellation large in a dashed chart ring, name, tier colour, line, evidence
chips. Linked from the persona card ("card").

**Starsign history.** A lifetime or range lists one reading per rendered year
in the persona card: "2021 Stormcaller · ... · 2026 Streakkeeper".

**Also in this branch:** starsign readings are seeded by login + sign +
window, so the same sign wears different stars for a different year, and the
card names the window it reads.

**Dropped as duplicate:** a `twocolor` flag; the 3MF has always shipped one
object per intensity level with per-object extruder bindings (M6) via the
existing `slots` parameter.

## Not in this branch (candidates, in rough value order)

Duel object (two logins back to back), keychain/display-wedge base variants,
top-languages colour ring, wrapped year-review sequence, org aggregate mode.

## Gates

`npm run typecheck` / `lint` / `test`: 111 tests green. New coverage: flags
round-trip + junk handling, sigil/peak geometry on single and multi builds,
buildOptionsFrom sign precedence, deriveSign consistency, window-seeded
sigils.
