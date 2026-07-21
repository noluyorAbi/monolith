#!/usr/bin/env bash
#
# Proves the print kit against a real slicer instead of trusting it.
#
# Downloads a kit from a running dev server, unpacks it, and hands the 3MF and
# the generated preset to Bambu Studio's CLI. Fails if the model will not slice
# or if any setting we claim to bake in does not come out the other end.
#
#   npm run dev &
#   ./scripts/verify-print-kit.sh
#
# Needs Bambu Studio installed. Skips cleanly when it is not.
set -euo pipefail

BASE="${BASE:-http://localhost:4321}"
LOGIN="${LOGIN:-noluyorAbi}"
YEAR="${YEAR:-2025}"
BS="/Applications/BambuStudio.app/Contents/MacOS/BambuStudio"
PROFILES="/Applications/BambuStudio.app/Contents/Resources/profiles/BBL"

if [ ! -x "$BS" ]; then
  echo "Bambu Studio not installed, skipping slicer verification."
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "1. downloading kit from $BASE"
curl -fsS "$BASE/api/kit?login=$LOGIN&year=$YEAR&variant=skyline&mm=180&printer=p1s&material=pla&quality=standard&slots=4" \
  -o "$WORK/kit.zip"
unzip -q "$WORK/kit.zip" -d "$WORK/kit"

THREEMF="$(find "$WORK/kit" -name '*.3mf' | head -1)"
PRESET="$(find "$WORK/kit" -name '*.json' | head -1)"
[ -n "$THREEMF" ] && [ -n "$PRESET" ] || { echo "kit is missing the 3mf or the preset"; exit 1; }
echo "   3mf:    $(basename "$THREEMF")"
echo "   preset: $(basename "$PRESET")"

echo "2. slicing with the shipped preset"
mkdir -p "$WORK/out"
"$BS" --load-settings "$PROFILES/machine/Bambu Lab P1S 0.4 nozzle.json;$PRESET" \
  --load-filaments "$PROFILES/filament/Bambu PLA Basic @BBL X1C.json" \
  --slice 0 --outputdir "$WORK/out" "$THREEMF" >"$WORK/slice.log" 2>&1 || true

GCODE="$WORK/out/plate_1.gcode"
[ -f "$GCODE" ] || { echo "SLICE FAILED"; tail -20 "$WORK/slice.log"; exit 1; }
echo "   sliced: $(du -h "$GCODE" | cut -f1) of gcode"

echo "3. checking every setting we claim to bake in"
fail=0
check() {
  actual="$(grep -m1 "^; $1 = " "$GCODE" | sed "s/^; $1 = //")"
  if [ "$actual" = "$2" ]; then
    printf "   ok   %-24s %s\n" "$1" "$actual"
  else
    printf "   FAIL %-24s expected %-12s got %s\n" "$1" "$2" "$actual"
    fail=1
  fi
}
check layer_height 0.16
check wall_loops 3
check top_shell_layers 5
check bottom_shell_layers 3
check sparse_infill_density "15%"
check sparse_infill_pattern gyroid
check enable_support 0
check seam_position back
check brim_type no_brim

echo "4. slicer's own mesh verdict"
grep -m1 -oE 'edges_fixed="[0-9]+" degenerate_facets="[0-9]+"[^/]*' "$WORK/slice.log" || true

if [ "$fail" -ne 0 ]; then
  echo "VERIFICATION FAILED"
  exit 1
fi
echo "VERIFIED: the kit slices and every setting survives the round trip."
