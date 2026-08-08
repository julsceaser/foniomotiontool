import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { Szene01 } from "./scenes/Szene01";
import { Szene04 } from "./scenes/Szene04";
import { Szene14 } from "./scenes/Szene14";
import { t, type Lang } from "./i18n";
import { COLORS } from "./theme";

export const FPS = 30;

export const SCENE_DURATIONS = {
  s01: 5 * FPS, // 150
  s04: 9 * FPS, // 270
  s14: 6 * FPS, // 180
} as const;

export const TOTAL_DURATION =
  SCENE_DURATIONS.s01 + SCENE_DURATIONS.s04 + SCENE_DURATIONS.s14; // 600 (20s)

export type FonioVideoProps = {
  lang: Lang;
};

export const FonioVideo: React.FC<FonioVideoProps> = ({ lang }) => {
  const strings = t(lang);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.dark }}>
      <Series>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.s01}>
          <Szene01 strings={strings} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.s04}>
          <Szene04 strings={strings} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.s14}>
          <Szene14 strings={strings} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
