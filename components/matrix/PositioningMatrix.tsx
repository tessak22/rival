import type { MatrixConfig } from "@/lib/config/rival-config";

export type MatrixPoint = {
  name: string;
  slug: string;
  x: number; // 0–10
  y: number; // 0–10
  isSelf?: boolean;
  xOverride?: boolean;
  yOverride?: boolean;
};

type Props = {
  points: MatrixPoint[];
  config: MatrixConfig;
};

const SVG_W = 560;
const SVG_H = 560;
const M = 70; // margin outside plot border
const PLOT = SVG_W - M * 2; // 420px plot area
const INSET = 24; // minimum px from plot border to any dot center
const MID_X = M + PLOT / 2;
const MID_Y = M + PLOT / 2;

function toSvgX(score: number): number {
  return M + INSET + (score / 10) * (PLOT - 2 * INSET);
}

function toSvgY(score: number): number {
  // SVG y increases downward; score 10 = top of plot
  return M + PLOT - INSET - (score / 10) * (PLOT - 2 * INSET);
}

const monoSm = {
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const
};

const CLUSTER_RADIUS = 100; // px — dots closer than this share a label column
const LABEL_STEP = 16; // px — vertical gap between staggered labels

function computeLabelOffsets(points: MatrixPoint[]): Map<string, number> {
  const offsets = new Map<string, number>();
  const assigned = new Set<string>();

  for (let i = 0; i < points.length; i++) {
    if (assigned.has(points[i].slug)) continue;
    const cx = toSvgX(points[i].x);
    const cy = toSvgY(points[i].y);
    const cluster: number[] = [i];

    for (let j = i + 1; j < points.length; j++) {
      if (assigned.has(points[j].slug)) continue;
      const dx = cx - toSvgX(points[j].x);
      const dy = cy - toSvgY(points[j].y);
      if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_RADIUS) {
        cluster.push(j);
      }
    }

    const start = -((cluster.length - 1) / 2) * LABEL_STEP;
    cluster.forEach((idx, pos) => {
      offsets.set(points[idx].slug, start + pos * LABEL_STEP);
      assigned.add(points[idx].slug);
    });
  }

  return offsets;
}

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
          <text x={M + 8} y={M + 16} fill="var(--ink-faint)" style={monoSm}>
            {ql.top_left}
          </text>
          <text x={MID_X + 8} y={M + 16} fill="var(--ink-faint)" style={monoSm}>
            {ql.top_right}
          </text>
          <text x={M + 8} y={MID_Y + 16} fill="var(--ink-faint)" style={monoSm}>
            {ql.bottom_left}
          </text>
          <text x={MID_X + 8} y={MID_Y + 16} fill="var(--ink-faint)" style={monoSm}>
            {ql.bottom_right}
          </text>
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

      {/* Y-axis labels — rotated to avoid clipping */}
      <text
        transform={`translate(${M - 14}, ${MID_Y + PLOT / 4}) rotate(-90)`}
        textAnchor="middle"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        ↓ {config.y_axis.label_low}
      </text>
      <text
        transform={`translate(${M - 14}, ${MID_Y - PLOT / 4}) rotate(-90)`}
        textAnchor="middle"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        {config.y_axis.label_high} ↑
      </text>

      {/* Competitor dots + name labels */}
      {(() => {
        const labelOffsets = computeLabelOffsets(points);
        return points.map((pt) => {
          const cx = toSvgX(pt.x);
          const cy = toSvgY(pt.y);
          const dotOffset = labelOffsets.get(pt.slug) ?? 0;
          // Dot and label move together so clustered items separate visually
          const dotCy = cy + dotOffset;
          const labelY = dotCy + 4;
          const nearRight = cx > M + PLOT - 90;
          return (
            <g key={pt.slug}>
              {/* Leader line: connects true data coordinate to displaced dot */}
              {dotOffset !== 0 && (
                <line
                  x1={cx}
                  y1={cy}
                  x2={nearRight ? cx - 10 : cx + 10}
                  y2={dotCy}
                  stroke="transparent"
                  strokeWidth={0.5}
                />
              )}
              <title>{pt.isSelf ? `${pt.name} (you)` : pt.name}</title>
              {pt.isSelf ? (
                <>
                  <circle cx={cx} cy={dotCy} r={8} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} />
                  <circle cx={cx} cy={dotCy} r={4} fill="var(--ink)" />
                </>
              ) : (
                <circle cx={cx} cy={dotCy} r={6} fill="var(--ink)" />
              )}
              <text
                x={nearRight ? cx - 12 : cx + 12}
                y={labelY}
                textAnchor={nearRight ? "end" : "start"}
                fill="var(--ink)"
                style={{ fontSize: 12, fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "-0.01em" }}
              >
                {pt.name}
                {pt.isSelf && " ★"}
              </text>
            </g>
          );
        });
      })()}
    </svg>
  );
}
