import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";
import { FPS, HEIGHT, WIDTH, type ReelProps } from "./types";

const defaults: ReelProps = {
  lang: "en",
  durationInFrames: 900,
  year: 2024,
  make: "Honda",
  model: "Accord Hybrid Sport",
  price: 29980,
  mileage: 27739,
  images: [],
  backdrops: [],
  shots: [],
  chips: [],
  captions: [],
  badge: { show: false, pct: 0 },
  audio: null,
  music: null,
  contact: null,
  cta: "Message us for a test drive",
  site: "dcnicecar.com",
};

export const Root: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={900}
    defaultProps={defaults}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
  />
);
