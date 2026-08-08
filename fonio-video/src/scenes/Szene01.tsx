import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
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
  const y = interpolate(frame, [start, start + duration], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, transform: `translateY(${y}px)` };
};

/**
 * Szene01 — 5s, dunkel (#0F0F16).
 * Zwei Typo-Zeilen faden nacheinander ein.
 */
export const Szene01: React.FC<{ strings: Strings }> = ({ strings }) => {
  const frame = useCurrentFrame();

  const line1 = fadeUp(frame, 15);
  const line2 = fadeUp(frame, 65);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.dark,
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
          gap: 36,
          padding: "0 120px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: COLORS.white,
            ...line1,
          }}
        >
          {strings.s01_line1}
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 400,
            letterSpacing: "-0.01em",
            color: "#9B9BA6",
            ...line2,
          }}
        >
          {strings.s01_line2}
        </div>
      </div>
    </AbsoluteFill>
  );
};
