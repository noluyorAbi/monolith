"use client";

import { OrbitControls } from "@react-three/drei";

/**
 * The orbit controls. Plain JSX with nothing to mutate, so it stays out of
 * SceneObject.tsx and under the same hook rules as every other component.
 */
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
