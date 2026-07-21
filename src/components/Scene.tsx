"use client";

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { Framing, Monolith } from "./SceneObject";
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

export interface SceneProps {
  mesh: BuiltMesh;
  finish: Palette;
  /** Ambient mode sinks the object below the type and drops the orbit rig. */
  ghost?: boolean;
  revealToken: string;
  spin: boolean;
  onInteract: () => void;
}

export default function Scene({
  mesh,
  finish,
  ghost = false,
  revealToken,
  spin,
  onInteract,
}: SceneProps) {
  const span = Math.max(mesh.size.x, mesh.size.z);
  const floorY = mesh.bounds.min[1];
  // Live, the object sits centred on the orbit pivot. Idle, it sinks below the
  // type so the headline owns the middle of the screen.
  const centreY = -(mesh.bounds.min[1] + mesh.bounds.max[1]) / 2;
  // Idle sat the object a full height below the frame, which cropped it at the
  // bottom edge and left the landing looking empty. It now sits low but whole,
  // under the hero copy rather than behind it.
  const offsetY = ghost ? centreY - mesh.size.y * 0.62 - span * 0.03 : centreY;

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

      <Framing mesh={mesh} offsetY={offsetY} pad={ghost ? 1.72 : 1} />
      {!ghost && <Rig spin={spin} onInteract={onInteract} />}
    </Canvas>
  );
}
