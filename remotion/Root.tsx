import React from "react";
import { Composition } from "remotion";
import { OgCard } from "./OgCard";
import { Banner } from "./Banner";
import { DEMO_SECONDS, Demo } from "./Demo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="OgCard" component={OgCard} durationInFrames={1} fps={1} width={1200} height={630} />
    <Composition id="Banner" component={Banner} durationInFrames={1} fps={1} width={1400} height={420} />
    <Composition id="Demo" component={Demo} durationInFrames={Math.round(DEMO_SECONDS * 30)} fps={30} width={1280} height={720} />
  </>
);
