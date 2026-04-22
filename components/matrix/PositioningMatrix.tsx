import type { MatrixConfig } from "@/lib/config/rival-config";

export type MatrixPoint = {
  name: string;
  slug: string;
  x: number; // 0–10
  y: number; // 0–10
};

type Props = {
  points: MatrixPoint[];
  config: MatrixConfig;
};

const SVG_W = 560;
const SVG_H = 560;
const M = 70; // margin
const PLOT = SVG_W - M * 2; // 420px plot area
const MID_X = M + PLOT / 2;
const MID_Y = M + PLOT / 2;

function toSvgX(score: number): number {
  return M + (score / 10) * PLOT;
}

function toSvgY(score: number): number {
  // SVG y increases downward; score 10 = top of plot
  return M + PLOT - (score / 10) * PLOT;
}

const monoSm = {
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const
};

export function PositioningMatrix({ points, config }: Props) {
  const ql = config.quadrant_labels;

  return (
    <svg
      id="positioning-matrix-svg"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W}
      height={SVG_H}
      style={{ display: "block", maxWidth: "100%", background: "var(--paper)" }}
      aria-label="Competitive positioning matrix"
    >
      {/* Quadrant tints */}
      <rect x={M} y={M} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.5} />
      <rect x={MID_X} y={M} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.2} />
      <rect x={M} y={MID_Y} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.2} />
      <rect x={MID_X} y={MID_Y} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.5} />

      {/* Plot border */}
      <rect x={M} y={M} width={PLOT} height={PLOT} fill="none" stroke="var(--ink)" strokeWidth={1} />

      {/* Quadrant dividers */}
      <line x1={MID_X} y1={M} x2={MID_X} y2={M + PLOT} stroke="var(--ink)" strokeWidth={0.5} strokeDasharray="4 4" />
      <line x1={M} y1={MID_Y} x2={M + PLOT} y2={MID_Y} stroke="var(--ink)" strokeWidth={0.5} strokeDasharray="4 4" />

      {/* Quadrant labels */}
      {ql && (
        <>
          <text x={M + 8} y={M + 16} fill="var(--ink-faint)" style={monoSm}>{ql.top_left}</text>
          <text x={MID_X + 8} y={M + 16} fill="var(--ink-faint)" style={monoSm}>{ql.top_right}</text>
          <text x={M + 8} y={MID_Y + 16} fill="var(--ink-faint)" style={monoSm}>{ql.bottom_left}</text>
          <text x={MID_X + 8} y={MID_Y + 16} fill="var(--ink-faint)" style={monoSm}>{ql.bottom_right}</text>
        </>
      )}

      {/* X-axis labels */}
      <text
        x={M}
        y={M + PLOT + 22}
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        ← {config.x_axis.label_low}
      </text>
      <text
        x={M + PLOT}
        y={M + PLOT + 22}
        textAnchor="end"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        {config.x_axis.label_high} →
      </text>

      {/* Y-axis labels */}
      <text
        x={M - 10}
        y={M + PLOT}
        textAnchor="end"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        {config.y_axis.label_low}
      </text>
      <text
        x={M - 10}
        y={M + 4}
        textAnchor="end"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        {config.y_axis.label_high}
      </text>

      {/* Competitor dots + name labels */}
      {points.map((pt) => {
        const cx = toSvgX(pt.x);
        const cy = toSvgY(pt.y);
        const nearRight = cx > M + PLOT - 90;
        return (
          <g key={pt.slug}>
            <circle cx={cx} cy={cy} r={6} fill="var(--ink)" />
            <text
              x={nearRight ? cx - 10 : cx + 10}
              y={cy + 4}
              textAnchor={nearRight ? "end" : "start"}
              fill="var(--ink)"
              style={{ fontSize: 12, fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              {pt.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
