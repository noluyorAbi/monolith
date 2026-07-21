"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { BuiltMesh } from "@/lib/types";
import type { Finish } from "@/lib/products";

interface Uniforms {
  uReveal: { value: number };
  uGlow: { value: number };
  uRim: { value: number };
  uBase: { value: THREE.Color };
  uRamp: { value: THREE.Color[] };
}

function useMonolithMaterial(finish: Finish) {
  const uniforms = useRef<Uniforms>({
    uReveal: { value: 0 },
    uGlow: { value: finish.glow },
    uRim: { value: finish.rim },
    uBase: { value: new THREE.Color(finish.base) },
    uRamp: { value: finish.ramp.map((c) => new THREE.Color(c)) },
  });

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uReveal = uniforms.current.uReveal;
      shader.uniforms.uGlow = uniforms.current.uGlow;
      shader.uniforms.uRim = uniforms.current.uRim;
      shader.uniforms.uBase = uniforms.current.uBase;
      shader.uniforms.uRamp = uniforms.current.uRamp;

      shader.vertexShader =
        `attribute float aLevel;
         attribute float aOrder;
         attribute float aBaseY;
         uniform float uReveal;
         varying float vLevel;
         varying float vGrow;
        ` +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vLevel = aLevel;
           float t = clamp((uReveal - aOrder * 0.72) / 0.28, 0.0, 1.0);
           float e = 1.0 - pow(1.0 - t, 3.0);
           vGrow = e;
           transformed.y = mix(aBaseY, transformed.y, e);`,
        );

      shader.fragmentShader =
        `uniform vec3 uBase;
         uniform vec3 uRamp[5];
         uniform float uGlow;
         uniform float uRim;
         varying float vLevel;
         varying float vGrow;
        ` +
        shader.fragmentShader
          .replace(
            "vec4 diffuseColor = vec4( diffuse, opacity );",
            `vec3 mono = uBase;
             float lit = 0.0;
             if (vLevel > -0.5) {
               mono = uRamp[0];
               lit = 0.18;
               if (vLevel > 0.5) { mono = uRamp[1]; lit = 0.42; }
               if (vLevel > 1.5) { mono = uRamp[2]; lit = 0.62; }
               if (vLevel > 2.5) { mono = uRamp[3]; lit = 0.82; }
               if (vLevel > 3.5) { mono = uRamp[4]; lit = 1.0; }
             }
             // Freshly risen geometry glows for a beat, so the build reads as heat.
             float heat = (1.0 - vGrow) * step(0.001, vGrow);
             mono = mix(mono, mono * 2.6 + vec3(0.06), heat);
             lit = mix(lit, 1.4, heat);
             vec4 diffuseColor = vec4( mono, opacity );`,
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
             // The plinth is sandblasted, the blocks are not. One material, two
             // surfaces, so the base never mirrors the studio lights.
             roughnessFactor = mix(0.97, roughnessFactor, step(-0.5, vLevel));`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
             // Busy days carry their own light. Without this the plinth wins the
             // frame and the data reads as texture instead of as the subject.
             totalEmissiveRadiance += mono * uGlow * lit;

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
    uniforms.current.uGlow.value = finish.glow;
    uniforms.current.uRim.value = finish.rim;
    material.roughness = finish.roughness;
    material.metalness = finish.metalness;
    material.envMapIntensity = 0.34 + finish.metalness * 0.7;
    material.needsUpdate = true;
  }, [finish, material]);

  useEffect(() => () => material.dispose(), [material]);

  return { material, uniforms: uniforms.current };
}

function Monolith({
  mesh,
  finish,
  offsetY,
  revealToken,
  onRevealed,
}: {
  mesh: BuiltMesh;
  finish: Finish;
  offsetY: number;
  revealToken: string;
  onRevealed?: () => void;
}) {
  const { material, uniforms } = useMonolithMaterial(finish);
  const fired = useRef(false);

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
    fired.current = false;
  }, [revealToken, uniforms]);

  useFrame((_, delta) => {
    const u = uniforms.uReveal;
    if (u.value < 1) {
      u.value = Math.min(1, u.value + delta / 1.35);
      if (u.value >= 1 && !fired.current) {
        fired.current = true;
        onRevealed?.();
      }
    }
  });

  return (
    <group position={[0, offsetY, 0]}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}

/**
 * A pool of light on the ground. The object is nearly as dark as the page, so
 * without something behind it there is no edge to read; this gives the
 * silhouette a surface to sit against and the shadow something to darken.
 */
function StudioFloor({ radius, y }: { radius: number; y: number }) {
  const texture = useMemo(() => {
    const s = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, s, s);
    const pool = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    pool.addColorStop(0, "rgba(255,255,255,0.13)");
    pool.addColorStop(0.4, "rgba(255,255,255,0.06)");
    pool.addColorStop(0.75, "rgba(255,255,255,0.015)");
    pool.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={-3}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/**
 * A soft blob under the object. Cheaper and far more predictable than a real
 * shadow pass, and for a piece sitting on a plinth it is all the grounding the
 * eye asks for.
 */
function SoftShadow({ width, depth, y }: { width: number; depth: number; y: number }) {
  const texture = useMemo(() => {
    const s = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.filter = "blur(42px)";
    ctx.fillStyle = "#ffffff";
    const inset = s * 0.26;
    ctx.beginPath();
    ctx.roundRect(inset, inset, s - inset * 2, s - inset * 2, s * 0.12);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={-1}>
      <planeGeometry args={[width * 1.55, depth * 2.6]} />
      <meshBasicMaterial
        color="#000000"
        alphaMap={texture}
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * A long flat object seen broadside wastes a portrait screen. Swinging the
 * azimuth down its length lets it recede diagonally instead, which fills a
 * tall frame with the same geometry.
 */
function viewDirection(aspect: number): THREE.Vector3 {
  const portrait = THREE.MathUtils.clamp((1.15 - aspect) / 0.65, 0, 1);
  return new THREE.Vector3(
    THREE.MathUtils.lerp(0.2, 0.92, portrait),
    THREE.MathUtils.lerp(0.62, 0.72, portrait),
    THREE.MathUtils.lerp(1, 0.62, portrait),
  ).normalize();
}

/**
 * Distance that just contains the bounding box for this exact aspect ratio.
 * Fitting the projected corners rather than a bounding sphere matters here:
 * the skyline is long and flat, and a sphere fit would push it half a screen
 * away.
 */
function fitDistance(mesh: BuiltMesh, offsetY: number, fovDeg: number, aspect: number): number {
  const dir = viewDirection(aspect);
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();

  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  const tanX = tanY * aspect;

  const { min, max } = mesh.bounds;
  let needed = 0;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(
      i & 1 ? max[0] : min[0],
      (i & 2 ? max[1] : min[1]) + offsetY,
      i & 4 ? max[2] : min[2],
    );
    const along = p.dot(dir);
    const dx = Math.abs(p.dot(right));
    const dy = Math.abs(p.dot(camUp));
    needed = Math.max(needed, along + dx / tanX, along + dy / tanY);
  }
  return needed * 1.02;
}

function Framing({ mesh, offsetY }: { mesh: BuiltMesh; offsetY: number }) {
  const { camera, size } = useThree();
  const goal = useRef(new THREE.Vector3());
  const settled = useRef(false);

  const docking = useRef(true);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
    const dist = fitDistance(mesh, offsetY, perspective.fov, aspect);
    // Re-framing keeps whatever angle the user has orbited to and moves only
    // the distance, so switching forms never yanks the view back to default.
    const dir = settled.current ? camera.position.clone().normalize() : viewDirection(aspect);
    goal.current.copy(dir).multiplyScalar(dist);
    if (!settled.current) {
      camera.position.copy(goal.current).multiplyScalar(1.9);
      settled.current = true;
    }
    docking.current = true;
    perspective.near = dist / 80;
    perspective.far = dist * 14;
    perspective.updateProjectionMatrix();
  }, [camera, mesh, offsetY, size.width, size.height]);

  useFrame((_, delta) => {
    // Only the arrival is animated. After that the orbit controls own the
    // camera and this must not fight them.
    if (!docking.current) return;
    const k = 1 - Math.pow(0.0022, delta);
    camera.position.lerp(goal.current, k);
    if (camera.position.distanceTo(goal.current) < goal.current.length() * 0.004) {
      docking.current = false;
    }
  });

  return null;
}

function Rig({ spin, onInteract }: { spin: boolean; onInteract: () => void }) {
  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.55}
      zoomSpeed={0.6}
      autoRotate={spin}
      autoRotateSpeed={0.55}
      minPolarAngle={0.18}
      maxPolarAngle={Math.PI / 2.06}
      onStart={onInteract}
    />
  );
}

export interface SceneProps {
  mesh: BuiltMesh;
  finish: Finish;
  /** Ambient mode sinks the object below the type and drops the orbit rig. */
  ghost?: boolean;
  revealToken: string;
  spin: boolean;
  onInteract: () => void;
  onRevealed?: () => void;
}

export default function Scene({
  mesh,
  finish,
  ghost = false,
  revealToken,
  spin,
  onInteract,
  onRevealed,
}: SceneProps) {
  const span = Math.max(mesh.size.x, mesh.size.z);
  const floorY = mesh.bounds.min[1];
  // Live, the object sits centred on the orbit pivot. Idle, it sinks below the
  // type so the headline owns the middle of the screen.
  const centreY = -(mesh.bounds.min[1] + mesh.bounds.max[1]) / 2;
  const offsetY = ghost ? centreY - mesh.size.y * 1.1 - span * 0.14 : centreY;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 30, position: [60, 130, 260] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        scene.background = new THREE.Color("#060708");
      }}
      style={{ touchAction: "none" }}
    >
      <fog attach="fog" args={["#060708", span * 2.2, span * 7]} />
      <ambientLight intensity={0.26} />
      <directionalLight position={[span * 0.55, span * 0.95, span * 0.45]} intensity={1.15} />
      <directionalLight
        position={[-span * 0.8, span * 0.3, -span * 0.6]}
        intensity={0.55}
        color="#7fa4ff"
      />
      {/* Kicker from behind, so the far edge separates from the background. */}
      <directionalLight position={[0, span * 0.22, -span * 1.1]} intensity={0.75} color="#cfe0ff" />

      <Environment resolution={128}>
        <Lightformer intensity={2.4} position={[0, 6, -8]} scale={[14, 8, 1]} color="#ffffff" />
        <Lightformer intensity={1.1} position={[-8, 2, 4]} scale={[8, 8, 1]} color="#88a6ff" />
        <Lightformer intensity={0.9} position={[8, 3, 3]} scale={[8, 8, 1]} color="#fff0c2" />
      </Environment>

      <Monolith
        mesh={mesh}
        finish={finish}
        offsetY={offsetY}
        revealToken={revealToken}
        onRevealed={onRevealed}
      />

      <StudioFloor radius={span * 2.6} y={floorY + offsetY - span * 0.006} />

      <SoftShadow
        width={mesh.size.x}
        depth={mesh.size.z}
        y={floorY + offsetY + span * 0.002}
      />

      <Grid
        position={[0, floorY + offsetY - span * 0.004, 0]}
        infiniteGrid
        cellSize={span / 18}
        cellThickness={0.5}
        sectionSize={span / 3}
        sectionThickness={0.85}
        cellColor="#272c32"
        sectionColor="#3a424b"
        fadeDistance={span * 8}
        fadeStrength={1.4}
      />

      <Framing mesh={mesh} offsetY={offsetY} />
      {!ghost && <Rig spin={spin} onInteract={onInteract} />}
    </Canvas>
  );
}
