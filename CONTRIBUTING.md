# Contributing

Issues and pull requests are welcome. Two rules carry all the weight:

**1. If you touch the geometry, `npm test` must still pass.**

The winding and closure tests exist because a flipped face is invisible on
screen and fatal on a printer. `test/mesh.test.ts` asserts that every form's
outward area vectors cancel, which is the cheapest way to catch an inside-out
solid before a slicer rejects it.

**2. If you touch the print kit, run `npm run verify:print` and say what the
slicer said.**

That script downloads a kit from a running dev server, hands the 3MF and the
generated preset to Bambu Studio's CLI, slices, and greps the resulting gcode
for every setting we claim to bake in. Claims about slicer behaviour in this
repository are measured, not remembered, and pull requests are held to the
same standard. If you cannot run it, say so and someone else will.

## Getting set up

```bash
npm install
npm run dev
```

No environment variables are needed. The app reads GitHub's public
contributions calendar; if it cannot reach the network it falls back to a
deterministic synthetic year and labels it as sample data.

## Layout

| Path | What lives there |
|------|------------------|
| `src/lib/` | Pure TypeScript, no three.js. Geometry, exporters, print profiles. |
| `src/components/` | The viewer and the interface. |
| `src/app/` | Routes and API endpoints. |
| `remotion/` | The banner, share card and demo, projected from the real mesh. |
| `test/` | Geometry, exporter and calibration tests. |
| `scripts/` | `verify-print-kit.sh`. |

## Licence

Contributions are accepted under the same PolyForm Noncommercial 1.0.0 licence
as the rest of the project.
