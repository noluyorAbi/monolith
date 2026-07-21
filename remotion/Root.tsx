import React from "react";
import { Composition } from "remotion";
import { OgCard } from "./OgCard";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="OgCard"
    component={OgCard}
    durationInFrames={1}
    fps={1}
    width={1200}
    height={630}
  />
);
