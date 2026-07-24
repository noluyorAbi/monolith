"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Grid, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { Framing, Monolith, Presenter } from "./SceneObject";
import { Rig } from "./Rig";
import type { BuiltMesh, StudioLights } from "@/lib/types";
import type { Palette } from "@/lib/palettes";

const STUDIO_ALL_ON: StudioLights = {
  key: true,
  fill: true,
  rim: true,
  front: false,
  glow: true,
};

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
    // Bright enough that a shadow has something to take away. At the old
    // levels the floor was near black, and a shadow on near black is a
    // rumour rather than a shape.
    const pool = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    pool.addColorStop(0, "rgba(255,255,255,0.32)");
    pool.addColorStop(0.4, "rgba(255,255,255,0.15)");
    pool.addColorStop(0.75, "rgba(255,255,255,0.025)");
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
      <shadowMaterial transparent opacity={0.72} depthWrite={false} />
    </mesh>
  );
}

/**
 * The three headline lights, with a hand on each switch.
 *
 * Flipping a switch eases the intensity rather than cutting it: a lamp with a
 * dimmer, not a breaker. The key at zero also takes its shadow with it, since
 * a light that no longer reaches the object cannot darken the floor either.
 */
function StudioRig({ span, studio }: { span: number; studio: StudioLights }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const front = useRef<THREE.DirectionalLight>(null);

  useFrame((_, delta) => {
    const k = 1 - Math.pow(0.004, delta);
    const ease = (light: THREE.DirectionalLight | null, on: boolean, full: number) => {
      if (!light) return;
      light.intensity += ((on ? full : 0) - light.intensity) * k;
    };
    ease(key.current, studio.key, 1.25);
    ease(fill.current, studio.fill, 0.55);
    ease(rim.current, studio.rim, 0.75);
    ease(front.current, studio.front, 0.7);
  });

  return (
    <>
      {/* The key light, and the only one that casts. Two shadows from one
        object read as a mistake long before they read as a studio. The frustum
        is fitted to the object rather than left at the default two units, which
        would put the whole thing outside the shadow camera. Held lower than a
        studio would hang it, because a low sun is what gives the towers a
        shadow long enough to read as one. The frustum and the blur radius stay
        modest: pushed wide, the sampling washed a faint grey over the whole
        shadow camera's footprint, which showed up on a large screen as an
        enormous rectangle no light ever drew. */}
      <directionalLight
        ref={key}
        castShadow
        position={[span * 0.58, span * 0.68, span * 0.45]}
        intensity={1.25}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={span * 0.004}
        shadow-radius={3.5}
        shadow-camera-near={span * 0.1}
        shadow-camera-far={span * 4}
        shadow-camera-left={-span * 1.0}
        shadow-camera-right={span * 1.0}
        shadow-camera-top={span * 1.0}
        shadow-camera-bottom={-span * 1.0}
      />
      <directionalLight
        ref={fill}
        position={[-span * 0.8, span * 0.3, -span * 0.6]}
        intensity={0.55}
        color="#7fa4ff"
      />
      {/* Kicker from behind, so the far edge separates from the background. */}
      <directionalLight
        ref={rim}
        position={[0, span * 0.22, -span * 1.1]}
        intensity={0.75}
        color="#cfe0ff"
      />
      {/* The frontal lamp, and the only one that starts switched off. It fills
        the camera-facing walls evenly, which is exactly what flattens a relief;
        worth having on the board for reading the colours, wrong as a default. */}
      <directionalLight
        ref={front}
        position={[span * 0.1, span * 0.4, span * 1.2]}
        intensity={0}
        color="#ffffff"
      />
    </>
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
  /** The same two, for the viewer. A phone needs both; a wide screen neither. */
  livePad?: number;
  liveShiftY?: number;
  /** Fit the viewer's object so a turn never crops it. Narrow screens only. */
  liveTurnSafe?: boolean;
  reduced?: boolean;
  /** Which studio lights are on. Absent means all of them. */
  studio?: StudioLights;
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
  livePad = 1,
  liveShiftY = 0,
  liveTurnSafe = false,
  reduced = false,
  studio = STUDIO_ALL_ON,
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
      // "percentage" = PCFShadowMap. three r185 deprecated PCFSoftShadowMap
      // and silently substitutes PCF anyway, so "soft" only bought a console
      // warning per shadow pass, not a softer shadow.
      shadows="percentage"
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
      <StudioRig span={span} studio={studio} />

      <Environment resolution={128}>
        <Lightformer intensity={2.4} position={[0, 6, -8]} scale={[14, 8, 1]} color="#ffffff" />
        <Lightformer intensity={1.1} position={[-8, 2, 4]} scale={[8, 8, 1]} color="#88a6ff" />
        <Lightformer intensity={0.9} position={[8, 3, 3]} scale={[8, 8, 1]} color="#fff0c2" />
      </Environment>

      {ghost ? (
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
              glowOn={studio.glow}
            />
          }
        />
      ) : (
        <Monolith
          mesh={mesh}
          finish={finish}
          offsetY={offsetY}
          revealToken={revealToken}
          glowOn={studio.glow}
        />
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
        pad={ghost ? pad : livePad}
        shiftX={ghost ? shiftX : 0}
        shiftY={ghost ? shiftY : liveShiftY}
        aim={ghost}
        turnSafe={!ghost && liveTurnSafe}
      />
      {!ghost && <Rig spin={spin} onInteract={onInteract} />}
    </Canvas>
  );
}
