import fs from "node:fs";
import path from "node:path";

export type MatrixAxisKey =
  | "openness_score"
  | "brand_trust_score"
  | "pricing_score"
  | "market_maturity_score"
  | "feature_breadth_score";

export type MatrixAxisConfig = {
  key: MatrixAxisKey;
  label_low: string;
  label_high: string;
};

export type MatrixQuadrantLabels = {
  top_left: string;
  top_right: string;
  bottom_left: string;
  bottom_right: string;
};

export type MatrixConfig = {
  x_axis: MatrixAxisConfig;
  y_axis: MatrixAxisConfig;
  quadrant_labels?: MatrixQuadrantLabels;
};

export const DEFAULT_MATRIX_CONFIG: MatrixConfig = {
  x_axis: { key: "openness_score", label_low: "Open Source", label_high: "Proprietary" },
  y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" },
  quadrant_labels: {
    top_left: "Trusted OSS",
    top_right: "Established Leaders",
    bottom_left: "Emerging Players",
    bottom_right: "Niche Specialists"
  }
};

export type RivalConfigEntry = {
  name: string;
  slug: string;
  url: string;
  manual?: Record<string, unknown> & { manual_last_updated?: string };
  pages?: Array<{
    label: string;
    url: string;
    type: string;
    geo_target?: string;
  }>;
};

export type ParsedRivalConfig = {
  self: RivalConfigEntry | null;
  competitors: RivalConfigEntry[];
  matrix: MatrixConfig | null;
};

type RawAxisConfig = {
  key?: string;
  label_low?: string;
  label_high?: string;
};

type RawConfig = {
  self?: RivalConfigEntry;
  competitors?: RivalConfigEntry[];
  matrix?: {
    x_axis?: RawAxisConfig;
    y_axis?: RawAxisConfig;
    quadrant_labels?: Partial<MatrixQuadrantLabels>;
  };
};

const VALID_AXIS_KEYS = new Set<MatrixAxisKey>([
  "openness_score",
  "brand_trust_score",
  "pricing_score",
  "market_maturity_score",
  "feature_breadth_score"
]);

function isValidAxisKey(key: unknown): key is MatrixAxisKey {
  return typeof key === "string" && VALID_AXIS_KEYS.has(key as MatrixAxisKey);
}

function parseAxisConfig(raw: RawAxisConfig | undefined): MatrixAxisConfig | null {
  if (!raw) return null;
  if (!isValidAxisKey(raw.key)) return null;
  if (typeof raw.label_low !== "string" || typeof raw.label_high !== "string") return null;
  return { key: raw.key, label_low: raw.label_low, label_high: raw.label_high };
}

export function parseRivalConfig(raw: RawConfig): ParsedRivalConfig {
  const self = raw.self ?? null;
  const competitors = raw.competitors ?? [];

  if (self) {
    const collision = competitors.find((c) => c.slug === self.slug);
    if (collision) {
      throw new Error(
        `rivals.config.json: slug collision between self and competitor "${self.slug}". Choose a different slug for one of them.`
      );
    }
  }

  let matrix: MatrixConfig | null = null;
  if (raw.matrix) {
    const x = parseAxisConfig(raw.matrix.x_axis);
    const y = parseAxisConfig(raw.matrix.y_axis);
    if (x && y) {
      matrix = { x_axis: x, y_axis: y };
      const ql = raw.matrix.quadrant_labels;
      if (
        ql &&
        typeof ql.top_left === "string" &&
        typeof ql.top_right === "string" &&
        typeof ql.bottom_left === "string" &&
        typeof ql.bottom_right === "string"
      ) {
        matrix.quadrant_labels = ql as MatrixQuadrantLabels;
      }
    }
  }

  return { self, competitors, matrix };
}

export function loadRivalConfig(): ParsedRivalConfig {
  const configPath = path.join(process.cwd(), "rivals.config.json");
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as RawConfig;
  return parseRivalConfig(raw);
}
