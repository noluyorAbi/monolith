# MONOLITH

Type a GitHub handle. Watch a year of commits get extruded into a solid object. Take the STL, or have it cast and shipped.

![The skyline form](shots/skyline.png)

The pitch is not "a chart of your contributions". It is the moment the chart stops being a chart: the page goes quiet, a build log counts up, and a physical thing rises out of a base plate with your handle engraved in it. That moment is the product. The STL is free because the object is what gets sold.

## What it does

- **Reads any public GitHub account.** No login, no OAuth, no upload. A token makes it faster; without one the public contributions calendar is parsed instead.
- **Builds four forms** from the same year of data, each a different reading of it.
- **Exports print-ready binary STL** at 60–400mm, generated server side from the same code the viewer runs.
- **Sells the object** in three editions through a checkout that works end to end in demo mode until a Stripe key shows up.

| Form | What it is |
|---|---|
| `skyline` | The full calendar, one column per day. The classic. |
| `ring` | 52 weeks bent into a circle, handle engraved in the centre disc. |
| `wave` | The calendar smoothed into one continuous surface. |
| `spine` | Twelve months, twelve towers, month names cut into the plate. |

<p align="center">
  <img src="shots/ring.png" width="49%" alt="The ring form" />
  <img src="shots/spine-titanium.png" width="49%" alt="The spine form in titanium" />
</p>

## Running it

```bash
npm install
npm run dev
```

That is the whole setup. Every environment variable is optional:

| Variable | Without it |
|---|---|
| `GITHUB_TOKEN` | The public contributions calendar is parsed instead of the GraphQL API. Same numbers, GitHub's own rate limits. |
| `STRIPE_SECRET_KEY` | Checkout runs in demo mode: real order records, nobody is charged, the UI says so. |
| `MONOLITH_ADMIN_KEY` | `/studio` is open in development and **404s in production**. It fails closed, so forgetting it never publishes the order queue. Visit `/studio?key=<value>` once; the key is swapped for an httpOnly cookie and dropped from the URL. |

If GitHub cannot be reached at all, the app falls back to a deterministic synthetic year and labels it `sample data` in the interface rather than quietly faking someone's history.

## Routes

| Route | Purpose |
|---|---|
| `/` | The prompt, the forge, the studio. One page, three states. |
| `/s/[login]?year=` | Shareable permalink. Boots straight into the build. |
| `/studio` | Production bench and order queue. Rebuild any handle at any size, pull the STL for a job. |
| `/order/[token]` | Order receipt with its production file. The token is a 128-bit capability, not the short serial, so receipts cannot be enumerated. |
| `/api/contributions?login=&year=` | The parsed year plus derived stats. |
| `/api/stl?login=&year=&variant=&mm=` | Binary STL download. |
| `/api/checkout` | Creates an order, returns a Stripe session or a demo confirmation. |

## How the geometry works

`src/lib/` is pure TypeScript with no three.js dependency, which is what lets the browser and the STL endpoint share one definition of the object:

- `mesh.ts` — a triangle-soup builder with boxes, annular wedges, and cylinders. Winding is counter-clockwise from outside; the tests assert that every variant's outward area vectors cancel, which is how a flipped face gets caught before a slicer rejects it.
- `build.ts` — the four forms, plus the engraving and the size fit.
- `font5x7.ts` — a hand-authored bitmap font. Handles are raised out of the plate as real geometry, so they survive the print rather than living in a texture.
- `stl.ts` — binary STL writer. The scene is Y-up and STL is Z-up, so axes swap on the way out.

Alongside the positions, the builder emits a contribution level, a chronological order, and a base height per vertex. The viewer's material reads all three: level picks the colour from the finish ramp, order and base height drive the reveal, so the object grows out of its plate in the order the commits happened without any per-bar scene objects.

## Tests

```bash
npm test
```

Covers face winding, surface closure per variant, the STL byte layout and axis swap, the size fit, stat derivation, and the font.

## Stack

Next.js 16, React 19, three.js via react-three-fiber, Motion, Tailwind v4. Orders live in a flat JSON file under `.data/`; swap `src/lib/orders.ts` for a database when the volume earns one.
