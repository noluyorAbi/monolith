"use client";

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { Framing, Monolith, Presenter } from "./SceneObject";
import { Rig } from "./Rig";
import type { BuiltMesh } from "@/lib/types";
import type { Palette } from "@/lib/palettes";

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
    pool.addColorStop(0, "rgba(255,255,255,0.17)");
    pool.addColorStop(0.4, "rgba(255,255,255,0.08)");
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
 * The surface the real shadow lands on.
 *
 * A shadow material is invisible except where something shadows it, so this
 * can be as wide as the light's reach without painting a floor over the page.
 * It has to be drawn after the pool of light above, which is additive: the
 * point of the shadow is to take that light back out again.
 */
function ShadowCatcher({ radius, y }: { radius: number; y: number }) {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={-2}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <shadowMaterial transparent opacity={0.78} depthWrite={false} />
    </mesh>
  );
}

/**
 * Contact darkening right under the footprint.
 *
 * The cast shadow above is the real one and does the work; this is the bit a
 * shadow map is worst at, the near black seam where an object meets the
 * surface it stands on. Tight to the plate, and it thins out as the object is
 * lifted, which is what the presenter scales it for.
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
      <planeGeometry args={[width * 1.06, depth * 1.35]} />
      <meshBasicMaterial
        color="#000000"
        alphaMap={texture}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </mesh>
  );
}

export interface SceneProps {
  mesh: BuiltMesh;
  finish: Palette;
  /** Ambient mode hands the object to the presenter and drops the orbit rig. */
  ghost?: boolean;
  revealToken: string;
  spin: boolean;
  onInteract: () => void;
  /** The ambient object has been taken hold of. Not the orbit rig's business. */
  onGrab?: () => void;
  /** Where the ambient object sits in the frame, as a fraction of the canvas. */
  shiftX?: number;
  shiftY?: number;
  /** Room around the ambient fit. Above 1 the object is read whole and small. */
  pad?: number;
  reduced?: boolean;
}

export default function Scene({
  mesh,
  finish,
  ghost = false,
  revealToken,
  spin,
  onInteract,
  onGrab,
  shiftX = 0,
  shiftY = 0,
  pad = 1.72,
  reduced = false,
}: SceneProps) {
  const span = Math.max(mesh.size.x, mesh.size.z);
  const fogRange = ghost ? pad : 1;
  const floorY = mesh.bounds.min[1];
  // Centred on the pivot in both modes. Ambient used to sink the object below
  // the type, which is what a backdrop does; it now has a column of its own,
  // and an object centred on the pivot is one that turns in place instead of
  // swinging around a point under its feet.
  const offsetY = -(mesh.bounds.min[1] + mesh.bounds.max[1]) / 2;

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 30, position: [60, 130, 260] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        scene.background = new THREE.Color("#060708");
      }}
      // Ambient, a vertical swipe belongs to the page and a sideways one to
      // the object. Live, the orbit rig owns every gesture on the canvas.
      style={{ touchAction: ghost ? "pan-y" : "none" }}
    >
      {/* The fog is measured in object spans, but the camera's distance is set
        by the fit, and the ambient fit stands well back so the object can share
        the frame with the copy. Fixed at the viewer's range, that put the whole
        landing object behind the fog on any narrow screen, where it faded to
        exactly the background colour and read as nothing at all. */}
      <fog
        attach="fog"
        args={["#060708", span * 2.2 * fogRange, span * 7 * fogRange]}
      />
      <ambientLight intensity={0.26} />
      {/* The key light, and the only one that casts. Two shadows from one
        object read as a mistake long before they read as a studio. The frustum
        is fitted to the object rather than left at the default two units, which
        would put the whole thing outside the shadow camera. */}
      <directionalLight
        castShadow
        position={[span * 0.55, span * 0.95, span * 0.45]}
        intensity={1.15}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={span * 0.004}
        shadow-radius={3}
        shadow-camera-near={span * 0.1}
        shadow-camera-far={span * 4}
        shadow-camera-left={-span * 0.9}
        shadow-camera-right={span * 0.9}
        shadow-camera-top={span * 0.9}
        shadow-camera-bottom={-span * 0.9}
      />
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

      {ghost ? (
        // The shadow turns with the object. It is the only thing that puts a
        // floating skyline on a surface, and a footprint that stayed put while
        // the object rotated above it would take that back.
        <Presenter
          spin={spin}
          reduced={reduced}
          span={span}
          onGrab={onGrab}
          object={
            <Monolith
              mesh={mesh}
              finish={finish}
              offsetY={offsetY}
              revealToken={revealToken}
            />
          }
          shadow={
            <SoftShadow
              width={mesh.size.x}
              depth={mesh.size.z}
              y={floorY + offsetY + span * 0.002}
            />
          }
        />
      ) : (
        <>
          <Monolith
            mesh={mesh}
            finish={finish}
            offsetY={offsetY}
            revealToken={revealToken}
          />
          <SoftShadow
            width={mesh.size.x}
            depth={mesh.size.z}
            y={floorY + offsetY + span * 0.002}
          />
        </>
      )}

      <StudioFloor radius={span * 2.6} y={floorY + offsetY - span * 0.006} />

      <ShadowCatcher radius={span * 2.6} y={floorY + offsetY - span * 0.005} />

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

      <Framing
        mesh={mesh}
        offsetY={offsetY}
        pad={ghost ? pad : 1}
        shiftX={ghost ? shiftX : 0}
        shiftY={ghost ? shiftY : 0}
        aim={ghost}
      />
      {!ghost && <Rig spin={spin} onInteract={onInteract} />}
    </Canvas>
  );
}
