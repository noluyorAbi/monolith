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
      <planeGeometry args={[width * 1.2, depth * 1.7]} />
      <meshBasicMaterial
        color="#000000"
        alphaMap={texture}
        transparent
        opacity={0.58}
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

      {ghost ? (
        // The shadow turns with the object. It is the only thing that puts a
        // floating skyline on a surface, and a footprint that stayed put while
        // the object rotated above it would take that back.
        <Presenter spin={spin} reduced={reduced}>
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
        </Presenter>
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
