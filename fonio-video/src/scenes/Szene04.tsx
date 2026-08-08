import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GEIST } from "../fonts";
import { COLORS, RADIUS } from "../theme";
import type { Strings } from "../i18n";

const PHONE_NUMBER = "664 123 45 67";
const TYPE_START = 35; // frame at which typing begins
const FRAMES_PER_CHAR = 4;
const BUTTON_START =
  TYPE_START + PHONE_NUMBER.length * FRAMES_PER_CHAR + 12; // ≈ frame 99

/** Rot-weiß-rote Flagge (Österreich) aus drei Divs. */
const AustrianFlag: React.FC = () => (
  <div
    style={{
      width: 54,
      height: 38,
      borderRadius: 8,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      boxShadow: "inset 0 0 0 1px rgba(9, 9, 11, 0.08)",
    }}
  >
    <div style={{ flex: 1, backgroundColor: COLORS.flagRed }} />
    <div style={{ flex: 1, backgroundColor: COLORS.white }} />
    <div style={{ flex: 1, backgroundColor: COLORS.flagRed }} />
  </div>
);

/** Puls-Ring, der dezent hinter dem Button expandiert. */
const PulseRing: React.FC<{ delay: number; startFrame: number }> = ({
  delay,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const PERIOD = 54;
  const local = frame - startFrame - delay;
  if (local < 0) {
    return null;
  }
  const progress = (local % PERIOD) / PERIOD;
  const scale = 1 + progress * 0.32;
  const opacity = interpolate(progress, [0, 0.15, 1], [0, 0.45, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: RADIUS + 6,
        border: `3px solid ${COLORS.brand}`,
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Szene04 — 9s, weiß.
 * Nummernfeld-Pill mit AT-Flagge, +43, tippender Nummer + Caret.
 * Danach poppt der CTA-Button mit spring() ein, zwei Puls-Ringe expandieren.
 */
export const Szene04: React.FC<{ strings: Strings }> = ({ strings }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Label
  const labelOpacity = interpolate(frame, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [0, 22], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pill
  const pillOpacity = interpolate(frame, [12, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pillY = interpolate(frame, [12, 32], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Nummer tippt sich zeichenweise
  const typedCount = Math.min(
    PHONE_NUMBER.length,
    Math.max(0, Math.floor((frame - TYPE_START) / FRAMES_PER_CHAR)),
  );
  const typed = PHONE_NUMBER.slice(0, typedCount);

  // Blinkender Caret (15 Frames an, 15 Frames aus)
  const caretVisible = frame % 30 < 15;

  // Button poppt mit spring()
  const buttonSpring = spring({
    frame: frame - BUTTON_START,
    fps,
    config: { damping: 11, stiffness: 130, mass: 0.7 },
  });
  const buttonScale = frame < BUTTON_START ? 0 : buttonSpring;
  const buttonOpacity = interpolate(
    frame,
    [BUTTON_START, BUTTON_START + 6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

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
          gap: 64,
        }}
      >
        {/* Label */}
        <div
          style={{
            fontSize: 46,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: COLORS.foreground,
            opacity: labelOpacity,
            transform: `translateY(${labelY}px)`,
            textAlign: "center",
            maxWidth: 1400,
          }}
        >
          {strings.s04_label}
        </div>

        {/* Nummernfeld-Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            backgroundColor: COLORS.white,
            border: `2px solid ${COLORS.border}`,
            borderRadius: 999,
            padding: "28px 48px",
            minWidth: 720,
            boxShadow: "0 12px 40px rgba(9, 9, 11, 0.08)",
            opacity: pillOpacity,
            transform: `translateY(${pillY}px)`,
          }}
        >
          <AustrianFlag />
          <span
            style={{
              fontSize: 44,
              fontWeight: 500,
              color: COLORS.muted,
            }}
          >
            +43
          </span>
          <div
            style={{
              width: 2,
              height: 44,
              backgroundColor: COLORS.border,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 44,
              fontWeight: 500,
              color: COLORS.foreground,
              whiteSpace: "pre",
              letterSpacing: "0.01em",
              display: "flex",
              alignItems: "center",
            }}
          >
            {typed}
            <span
              style={{
                display: "inline-block",
                width: 3,
                height: 48,
                marginLeft: 4,
                backgroundColor: COLORS.brand,
                opacity: caretVisible ? 1 : 0,
              }}
            />
          </span>
        </div>

        {/* CTA-Button mit Puls-Ringen */}
        <div
          style={{
            position: "relative",
            opacity: buttonOpacity,
            transform: `scale(${buttonScale})`,
          }}
        >
          <PulseRing startFrame={BUTTON_START + 14} delay={0} />
          <PulseRing startFrame={BUTTON_START + 14} delay={27} />
          <div
            style={{
              position: "relative",
              backgroundColor: COLORS.brand,
              color: COLORS.white,
              fontSize: 38,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              padding: "26px 64px",
              borderRadius: RADIUS + 6,
              boxShadow: "0 14px 44px rgba(88, 93, 254, 0.35)",
            }}
          >
            {strings.s04_button}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
