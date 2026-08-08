import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GEIST } from "../fonts";
import { COLORS } from "../theme";
import type { Strings } from "../i18n";

const fadeUp = (
  frame: number,
  start: number,
  duration = 25,
): { opacity: number; transform: string } => {
  const opacity = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [start, start + duration], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, transform: `translateY(${y}px)` };
};

/**
 * Szene14 — 6s, weiß.
 * "Es läutet." groß einfaden, dann Zeile 2 und 3 gestaffelt.
 */
export const Szene14: React.FC<{ strings: Strings }> = ({ strings }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const line1Spring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 90, mass: 0.8 },
  });
  const line1Opacity = interpolate(frame, [10, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line1Scale = 0.94 + line1Spring * 0.06;

  const line2 = fadeUp(frame, 65);
  const line3 = fadeUp(frame, 105);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.white,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: GEIST,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 42,
          padding: "0 120px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 110,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: COLORS.foreground,
            opacity: line1Opacity,
            transform: `scale(${line1Scale})`,
          }}
        >
          {strings.s14_line1}
        </div>
        <div
          style={{
            fontSize: 54,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            color: COLORS.foreground,
            ...line2,
          }}
        >
          {strings.s14_line2}
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 400,
            color: COLORS.muted,
            ...line3,
          }}
        >
          {strings.s14_line3}
        </div>
      </div>
    </AbsoluteFill>
  );
};
