import { prisma } from "@/lib/db/client";
import {
  loadRivalConfig,
  DEFAULT_MATRIX_CONFIG,
  type MatrixConfig,
  type MatrixAxisKey
} from "@/lib/config/rival-config";
import { PositioningMatrix, type MatrixPoint } from "@/components/matrix/PositioningMatrix";
import { MatrixDownloadButton } from "@/components/matrix/MatrixDownloadButton";
import { RDSPageShell, RDSHeader, RDSFooter, RDSEmpty, RDSKicker } from "@/components/rds";

export const dynamic = "force-dynamic";

function getAxisScore(brief: unknown, key: MatrixAxisKey): number | null {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) return null;
  const val = (brief as Record<string, unknown>)[key];
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return Math.max(0, Math.min(10, val));
}

export default async function MatrixPage() {
  let matrixConfig: MatrixConfig;
  try {
    const config = loadRivalConfig();
    matrixConfig = config.matrix ?? DEFAULT_MATRIX_CONFIG;
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      matrixConfig = DEFAULT_MATRIX_CONFIG;
    } else {
      throw err;
    }
  }

  const competitors = await prisma.competitor.findMany({
    where: { isSelf: false },
    select: { id: true, name: true, slug: true, intelligenceBrief: true },
    orderBy: { name: "asc" }
  });

  const points: MatrixPoint[] = [];
  let missingScores = 0;

  for (const c of competitors) {
    const x = getAxisScore(c.intelligenceBrief, matrixConfig.x_axis.key);
    const y = getAxisScore(c.intelligenceBrief, matrixConfig.y_axis.key);
    if (x === null || y === null) {
      missingScores++;
      continue;
    }
    points.push({ name: c.name, slug: c.slug, x, y });
  }

  const hasEnoughData = points.length >= 2;

  return (
    <RDSPageShell>
      <RDSHeader right={hasEnoughData ? <MatrixDownloadButton /> : null} />

      <div style={{ marginBottom: 24 }}>
        <RDSKicker>Competitive Landscape</RDSKicker>
        <h1
          style={{
            margin: "6px 0 4px",
            fontSize: "var(--fs-28)",
            fontWeight: 700,
            fontFamily: "var(--font-serif)",
            letterSpacing: "var(--tr-snug)"
          }}
        >
          Positioning Matrix
        </h1>
        <p style={{ margin: 0, color: "var(--ink-mute)", fontSize: "var(--fs-14)" }}>
          {matrixConfig.x_axis.label_low} ↔ {matrixConfig.x_axis.label_high} vs{" "}
          {matrixConfig.y_axis.label_low} ↔ {matrixConfig.y_axis.label_high}
        </p>
      </div>

      {!hasEnoughData ? (
        <RDSEmpty
          title="Not enough data"
          body={
            missingScores > 0
              ? `${missingScores} competitor${missingScores === 1 ? "" : "s"} ${
                  missingScores === 1 ? "has" : "have"
                } no brief scores yet. Re-generate briefs to populate the matrix.`
              : "Add at least 2 competitors and generate their intelligence briefs to see the positioning matrix."
          }
        />
      ) : (
        <div>
          <PositioningMatrix points={points} config={matrixConfig} />
          {missingScores > 0 && (
            <p
              style={{
                marginTop: 12,
                fontSize: "var(--fs-12)",
                color: "var(--ink-faint)",
                fontFamily: "var(--font-mono)"
              }}
            >
              {missingScores} competitor{missingScores === 1 ? "" : "s"} excluded — brief scores missing. Re-generate to
              include.
            </p>
          )}
        </div>
      )}

      <RDSFooter />
    </RDSPageShell>
  );
}
