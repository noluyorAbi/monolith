"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
}

function useMonolithMaterial(finish: Palette) {
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

export function Monolith({
  mesh,
  finish,
  offsetY,
  revealToken,
}: {
  mesh: BuiltMesh;
  finish: Palette;
  offsetY: number;
  revealToken: string;
}) {
  const { material, uniforms } = useMonolithMaterial(finish);

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

  useFrame((_, delta) => {
    const u = uniforms.uReveal;
    if (u.value < 1) u.value = Math.min(1, u.value + delta / 1.35);
  });

  return (
    <group position={[0, offsetY, 0]}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}

export function Framing({ mesh, offsetY }: { mesh: BuiltMesh; offsetY: number }) {
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

export function Rig({ spin, onInteract }: { spin: boolean; onInteract: () => void }) {
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
