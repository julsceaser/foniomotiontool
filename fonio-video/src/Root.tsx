import "./index.css";
import React from "react";
import { Composition } from "remotion";
import {
  FonioVideo,
  FPS,
  TOTAL_DURATION,
  type FonioVideoProps,
} from "./FonioVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FonioExplainer"
      component={FonioVideo}
      durationInFrames={TOTAL_DURATION}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ lang: "de" } satisfies FonioVideoProps}
    />
  );
};
