"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { fitDistance, viewDirection } from "./framing";
import type { BuiltMesh } from "@/lib/types";
import type { Palette } from "@/lib/palettes";

/**
 * The parts that talk to the renderer, and only those.
 *
 * react-three-fiber draws into a WebGL scene graph, where mutating the camera
 * and a material's uniforms is the documented API and useFrame deliberately
 * runs outside React's render cycle. The React Compiler's purity rules model a
 * DOM-rendering world and read those documented calls as defects, so they are
 * switched off for this file alone in eslint.config.mjs. Keeping that surface
 * to one small module is the point: the projection maths in framing.ts and the
 * canvas textures in Scene.tsx stay under the same rules as everything else.
 */

interface Uniforms {
  uReveal: { value: number };
  uGlow: { value: number };
  uRim: { value: number };
  uBase: { value: THREE.Color };
  uRamp: { value: THREE.Color[] };
  /** Where the pointer meets the plate, in the mesh's own coordinates. */
  uPoint: { value: THREE.Vector2 };
  /** Radius of the lit pool around that point. */
  uPointR: { value: number };
  /** How much of the pool to show, eased so it breathes in and out. */
  uTouch: { value: number };
}

function useMonolithMaterial(finish: Palette) {
  const uniforms = useRef<Uniforms>({
    uReveal: { value: 0 },
    uGlow: { value: finish.glow },
    uRim: { value: finish.rim },
    uBase: { value: new THREE.Color(finish.base) },
    uRamp: { value: finish.ramp.map((c) => new THREE.Color(c)) },
    uPoint: { value: new THREE.Vector2(1e6, 1e6) },
    uPointR: { value: 1 },
    uTouch: { value: 0 },
  });

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uReveal = uniforms.current.uReveal;
      shader.uniforms.uGlow = uniforms.current.uGlow;
      shader.uniforms.uRim = uniforms.current.uRim;
      shader.uniforms.uBase = uniforms.current.uBase;
      shader.uniforms.uRamp = uniforms.current.uRamp;
      shader.uniforms.uPoint = uniforms.current.uPoint;
      shader.uniforms.uPointR = uniforms.current.uPointR;
      shader.uniforms.uTouch = uniforms.current.uTouch;

      shader.vertexShader =
        `attribute float aLevel;
         attribute float aOrder;
         attribute float aBaseY;
         uniform float uReveal;
         varying float vLevel;
         varying float vGrow;
         varying vec2 vPlate;
        ` +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vLevel = aLevel;
           vPlate = position.xz;
           float t = clamp((uReveal - aOrder * 0.72) / 0.28, 0.0, 1.0);
           // Smoothstep rather than a pure ease-out: ease-out is fastest at
           // birth, so every frame a handful of towers snapped into motion and
           // the build front read as jitter. Zero velocity at both ends keeps
           // the wave sweeping without the pop.
           float e = t * t * (3.0 - 2.0 * t);
           vGrow = e;
           transformed.y = mix(aBaseY, transformed.y, e);`,
        );

      shader.fragmentShader =
        `uniform vec3 uBase;
         uniform vec3 uRamp[5];
         uniform float uGlow;
         uniform float uRim;
         uniform vec2 uPoint;
         uniform float uPointR;
         uniform float uTouch;
         varying float vLevel;
         varying float vGrow;
         varying vec2 vPlate;
        ` +
        shader.fragmentShader
          .replace(
            "vec4 diffuseColor = vec4( diffuse, opacity );",
            `// The plinth's stated colour is nearly black, and a 6% albedo
             // cannot show a lamp being switched: the studio controls read as
             // affecting only the towers. Lifted here for the lighting maths
             // only, the plate answers light while still reading dark, and the
             // scaled term keeps pale bases like bone from blowing out.
             vec3 mono = uBase * 1.6 + vec3(0.035);
             float lit = 0.0;
             if (vLevel > -0.5) {
               mono = uRamp[0];
               lit = 0.18;
               if (vLevel > 0.5) { mono = uRamp[1]; lit = 0.42; }
               if (vLevel > 1.5) { mono = uRamp[2]; lit = 0.62; }
               if (vLevel > 2.5) { mono = uRamp[3]; lit = 0.82; }
               if (vLevel > 3.5) { mono = uRamp[4]; lit = 1.0; }
             }
             // Freshly risen geometry glows for a beat, so the build reads as
             // heat. The glow fades in over the first fifth of the rise rather
             // than arriving at full strength on a tower's first frame: the
             // instant version made every birth a white flash, and a plate of
             // staggered births flickered like a faulty lamp.
             float heat = smoothstep(0.0, 0.22, vGrow) * (1.0 - vGrow);
             mono = mix(mono, mono * 2.6 + vec3(0.06), heat);
             lit = mix(lit, 1.4, heat);
             vec4 diffuseColor = vec4( mono, opacity );`,
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
             // The plinth is sandblasted, the blocks are not. One material, two
             // surfaces. Matte enough not to mirror the light formers, rough
             // enough short of full that a switched lamp still lands on it.
             roughnessFactor = mix(0.86, roughnessFactor, step(-0.5, vLevel));`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
             // Busy days carry their own light. Without this the plinth wins the
             // frame and the data reads as texture instead of as the subject.
             totalEmissiveRadiance += mono * uGlow * lit;

             // A pool of warmth in the data under the pointer. Not a spotlight
             // from outside but the days themselves brightening, the same way
             // the build's heat works: the year noticing where you look.
             float touchD = distance( vPlate, uPoint );
             float touch = smoothstep( uPointR, uPointR * 0.18, touchD ) * uTouch * step( -0.5, vLevel );
             totalEmissiveRadiance += ( mono * 1.7 + vec3( 0.05 ) ) * touch * ( 0.35 + 0.65 * lit );

             // A dark object on a dark page has no outline at all. This traces
             // every silhouette and every block edge, weighted up on the plinth,
             // which is the part that otherwise disappears into the background.
             float facing = 1.0 - saturate( dot( normalize( vViewPosition ), normal ) );
             float rim = pow( facing, 4.0 ) * mix( 1.4, 1.0, step( -0.5, vLevel ) );
             totalEmissiveRadiance += vec3( 0.56, 0.64, 0.77 ) * rim * uRim;`,
          );
    };
    return mat;
  }, []);

  useEffect(() => {
    uniforms.current.uBase.value.set(finish.base);
    finish.ramp.forEach((c, i) => uniforms.current.uRamp.value[i].set(c));
    // uGlow is deliberately not written here: the frame loop owns it, easing
    // finish.glow through the studio's glow switch.
    uniforms.current.uRim.value = finish.rim;
    material.roughness = finish.roughness;
    material.metalness = finish.metalness;
    material.envMapIntensity = 0.34 + finish.metalness * 0.7;
    material.needsUpdate = true;
  }, [finish, material]);

  useEffect(() => () => material.dispose(), [material]);

  return { material, uniforms: uniforms.current };
}

/** Scratch space for the per-frame pointer projection, allocated once. */
const _inv = new THREE.Matrix4();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function Monolith({
  mesh,
  finish,
  offsetY,
  revealToken,
  glowOn = true,
}: {
  mesh: BuiltMesh;
  finish: Palette;
  offsetY: number;
  revealToken: string;
  /** The studio's emissive switch. Eased, so the days dim rather than cut. */
  glowOn?: boolean;
}) {
  const { material, uniforms } = useMonolithMaterial(finish);
  const body = useRef<THREE.Mesh>(null);
  /** How much of the finish's own glow is being shown, 0..1. */
  const glowShown = useRef(1);
  // Touch screens park the pointer wherever the last tap landed, which would
  // leave a pool of light frozen into the object. The pool is for a pointer
  // that can hover.
  const fine = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches,
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute("aLevel", new THREE.BufferAttribute(mesh.levels, 1));
    g.setAttribute("aOrder", new THREE.BufferAttribute(mesh.order, 1));
    g.setAttribute("aBaseY", new THREE.BufferAttribute(mesh.baseY, 1));
    g.computeVertexNormals();
    return g;
  }, [mesh]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    uniforms.uReveal.value = 0;
  }, [revealToken, uniforms]);

  useFrame(({ raycaster, pointer, camera }, delta) => {
    const u = uniforms.uReveal;
    // Scrolling the story re-renders panels on the main thread, and a long
    // frame there arrives here as a delta spike; fed straight into the reveal
    // it teleports the build wave forward. Capped, a hitch slows the wave for
    // a frame instead of jumping it.
    if (u.value < 1) u.value = Math.min(1, u.value + Math.min(delta, 1 / 30) / 1.35);

    // The glow switch, eased here rather than stamped in an effect so turning
    // the emissive off reads as the days cooling instead of a breaker trip.
    const g = glowShown.current + ((glowOn ? 1 : 0) - glowShown.current) * (1 - Math.pow(0.004, delta));
    glowShown.current = g;
    uniforms.uGlow.value = finish.glow * g;

    // Where the pointer's ray crosses the plate, found in the mesh's own
    // coordinates so it stays correct however the presenter has turned or
    // lifted the object. A plane test rather than a raycast against the
    // geometry: the pool lights days by where you point across the plate, and
    // an intersection against fifty thousand triangles every frame would buy
    // no more than that.
    const node = body.current;
    const t = uniforms.uTouch;
    let over = false;
    if (fine && node) {
      raycaster.setFromCamera(pointer, camera);
      node.updateWorldMatrix(true, false);
      _inv.copy(node.matrixWorld).invert();
      _origin.copy(raycaster.ray.origin).applyMatrix4(_inv);
      _dir.copy(raycaster.ray.direction).transformDirection(_inv);
      const plateY = mesh.bounds.min[1];
      const along = (plateY - _origin.y) / _dir.y;
      if (Number.isFinite(along) && along > 0) {
        const x = _origin.x + _dir.x * along;
        const z = _origin.z + _dir.z * along;
        const reach = Math.max(mesh.size.x, mesh.size.z) * 0.08;
        over =
          x > mesh.bounds.min[0] - reach &&
          x < mesh.bounds.max[0] + reach &&
          z > mesh.bounds.min[2] - reach &&
          z < mesh.bounds.max[2] + reach;
        if (over) uniforms.uPoint.value.set(x, z);
      }
    }
    t.value += ((over ? 1 : 0) - t.value) * (1 - Math.pow(0.002, delta));
  });

  useEffect(() => {
    uniforms.uPointR.value = Math.max(mesh.size.x, mesh.size.z) * 0.14;
  }, [mesh, uniforms]);

  return (
    <group position={[0, offsetY, 0]}>
      <mesh
        ref={body}
        castShadow
        receiveShadow
        geometry={geometry}
        material={material}
      />
    </group>
  );
}

/**
 * The landing object, under the hand rather than under glass.
 *
 * The live viewer orbits the camera, which is right when the object owns the
 * screen. Here it does not: it shares the frame with the headline and the
 * field, and a camera orbit would swing it out from under its own column. So
 * the object turns instead of the camera, which keeps it anchored where the
 * layout put it.
 *
 * Three things move it, in falling order of authority: a drag, the pointer
 * drifting across the page, and its own slow turn. Each is a spring towards a
 * target rather than a value written straight to the transform, so letting go
 * of a drag hands the object back to the drift without a step.
 */
export function Presenter({
  object,
  /** Used to size the lift, so it is the same gesture at every object scale. */
  span,
  spin,
  reduced,
  onGrab,
}: {
  object: React.ReactNode;
  span: number;
  spin: boolean;
  reduced: boolean;
  onGrab?: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const lift = useRef<THREE.Group>(null);
  const { gl } = useThree();

  /**
   * The angle the object rests at. Square to the camera it reads as a wall of
   * bars; a third of a turn off it reads as a solid with a length, which is
   * the thing being sold.
   */
  const yaw = useRef(-0.5);
  const yawShown = useRef(-0.5);
  /** Where the pointer sits, in -1 to 1 across the canvas. */
  const point = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  /** Seconds of stillness owed before the sway resumes. */
  const rest = useRef(0);
  const clock = useRef(0);
  /** How much of the drag is being shown, 0 to 1. Drives the lift. */
  const held = useRef(0);
  /** Radians per second still owed from the throw at the end of a drag. */
  const fling = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = "grab";
    // A touch drag has to earn the object: until it is clearly sideways the
    // browser owns the gesture and scrolls the page, which is what the canvas
    // pan-y touch action allows for.
    const SLOP = 5;
    let candidate = false;
    let startX = 0;
    let startY = 0;

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      candidate = true;
      dragging.current = e.pointerType !== "touch";
      startX = e.clientX;
      startY = e.clientY;
      last.current = { x: e.clientX, y: e.clientY };
      rest.current = 1.1;
      fling.current = 0;
      if (dragging.current) {
        el.style.cursor = "grabbing";
        onGrab?.();
      }
    };

    const move = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      point.current = {
        x: ((e.clientX - box.left) / box.width) * 2 - 1,
        y: ((e.clientY - box.top) / box.height) * 2 - 1,
      };
      if (!candidate) return;

      if (!dragging.current) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(dy)) return;
        dragging.current = true;
        onGrab?.();
      }

      // Yaw only. A drag that also tilted would lift the object off the
      // shadow it turns above, and the shadow is what puts it on a surface.
      const step = (e.clientX - last.current.x) * 0.0072;
      yaw.current += step;
      // Kept so letting go mid sweep carries the turn on rather than stopping
      // it dead, which is the difference between turning a solid and scrubbing
      // a slider.
      fling.current = step * 26;
      last.current = { x: e.clientX, y: e.clientY };
      rest.current = 1.1;
    };

    const up = () => {
      candidate = false;
      dragging.current = false;
      el.style.cursor = "grab";
    };

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl, onGrab]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    if (rest.current > 0) rest.current -= delta;
    // A sway rather than a turn. A continuous rotation eventually presents the
    // plate broadside and the year edge on, which is the one angle where the
    // object reads as a grey slab; swinging through a sixth of a radian keeps
    // it alive and never leaves the angle the layout was drawn around.
    if (spin && !reduced && rest.current <= 0 && !dragging.current) {
      clock.current += delta;
    }
    const sway = spin && !reduced ? Math.sin(clock.current * 0.26) * 0.15 : 0;

    // The throw, spent over about a second.
    if (!dragging.current && fling.current !== 0) {
      yaw.current += fling.current * delta;
      fling.current *= Math.pow(0.02, delta);
      if (Math.abs(fling.current) < 0.01) fling.current = 0;
    }

    // Frame-rate independent approach: the same fraction of the remaining
    // distance per second regardless of how often this runs.
    const k = 1 - Math.pow(0.0001, delta);
    yawShown.current += (yaw.current - yawShown.current) * k;

    // The drift is deliberately small. It should register as the object
    // noticing the pointer, not as a second control.
    const drift = reduced ? 0 : 1;
    g.rotation.y = yawShown.current + sway + point.current.x * 0.06 * drift;
    g.rotation.x = -point.current.y * 0.04 * drift;
    g.rotation.z = point.current.x * 0.012 * drift;

    // Picked up, not just spun: the object rises a little off the surface
    // while it is being held. The shadows are real now, cast and re-rendered
    // from the geometry itself, so they answer the lift on their own: the
    // contact pool thins and the silhouette drifts without being told to.
    const wanted = dragging.current ? 1 : 0;
    held.current += (wanted - held.current) * (1 - Math.pow(0.02, delta));
    const l = lift.current;
    if (l) l.position.y = held.current * span * 0.035;
  });

  return (
    <group ref={group}>
      <group ref={lift}>{object}</group>
    </group>
  );
}

export function Framing({
  mesh,
  offsetY,
  /** Extra room around the fit. The landing wants the object read whole and
      small rather than filling the frame the way the viewer does. */
  pad = 1,
  /** Fraction of the canvas to push the object right (+) or left (-). */
  shiftX = 0,
  /** Fraction of the canvas to push the object down (+) or up (-). */
  shiftY = 0,
  /**
   * Point the camera at the pivot. The orbit rig does this itself, so it is
   * only wanted when there is no rig: r3f aims the camera once at creation and
   * never again, and this component then moves it somewhere else entirely. On
   * a landscape screen the two directions were close enough to hide it; in
   * portrait the fitted direction swings most of a right angle away, and the
   * object left the frame completely.
   */
  aim = false,
}: {
  mesh: BuiltMesh;
  offsetY: number;
  pad?: number;
  shiftX?: number;
  shiftY?: number;
  aim?: boolean;
}) {
  const { camera, size } = useThree();
  const goal = useRef(new THREE.Vector3());
  const settled = useRef(false);

  const docking = useRef(true);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
    // The viewer swings the camera down the object's length on a tall screen,
    // which fills a portrait frame. The landing does not want that: from up
    // there the object is a plate seen from above, and what sells it is the
    // low three quarter view. So the landing keeps the landscape angle at
    // every width and lets the presenter's own turn supply the diagonal.
    const angle = aim ? viewDirection(1.7) : viewDirection(aspect);
    const dist = fitDistance(mesh, offsetY, perspective.fov, aspect, angle) * pad;
    // Re-framing keeps whatever angle the user has orbited to and moves only
    // the distance, so switching forms never yanks the view back to default.
    const dir = settled.current && !aim ? camera.position.clone().normalize() : angle;
    goal.current.copy(dir).multiplyScalar(dist);
    if (!settled.current) {
      camera.position.copy(goal.current).multiplyScalar(1.9);
      settled.current = true;
    }
    docking.current = true;
    perspective.near = dist / 80;
    perspective.far = dist * 14;

    // Moving the object itself out of the middle would make it orbit its own
    // column whenever it turns. Offsetting the frustum instead slides the
    // whole picture across the canvas and leaves the object turning in place,
    // which is what a column of a layout needs from it.
    if (shiftX || shiftY) {
      perspective.setViewOffset(
        size.width,
        size.height,
        -shiftX * size.width,
        -shiftY * size.height,
        size.width,
        size.height,
      );
    } else {
      perspective.clearViewOffset();
    }
    perspective.updateProjectionMatrix();
    if (aim) camera.lookAt(0, 0, 0);
  }, [aim, camera, mesh, offsetY, pad, shiftX, shiftY, size.width, size.height]);

  useFrame((_, delta) => {
    // Only the arrival is animated. After that the orbit controls own the
    // camera and this must not fight them.
    if (!docking.current) return;
    const k = 1 - Math.pow(0.0022, delta);
    camera.position.lerp(goal.current, k);
    if (aim) camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(goal.current) < goal.current.length() * 0.004) {
      docking.current = false;
    }
  });

  return null;
}
