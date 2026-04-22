import Link from "next/link";
import { notFound } from "next/navigation";

import { DeepDiveClient } from "@/components/deep-dive/DeepDiveClient";
import { RDSPageShell, RDSHeader, RDSFooter, RDSSectionHead, RDSKicker, RDSEmpty, RDSChip } from "@/components/rds";
import { prisma } from "@/lib/db/client";
import { DEEP_DIVE_TEMPLATES } from "@/lib/deep-dive-templates";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function getTemplateLabel(promptTemplate: string | null): string {
  if (!promptTemplate) return "General Research";
  const found = DEEP_DIVE_TEMPLATES.find((t) => t.key === promptTemplate);
  return found?.label ?? "General Research";
}

export default async function DeepDivePage({ params }: PageProps) {
  const { slug } = await params;
  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    select: { id: true, name: true, baseUrl: true }
  });

  if (!competitor) notFound();

  const previousDeepDives = await prisma.deepDive.findMany({
    where: { competitorId: competitor.id },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return (
    <RDSPageShell>
      <RDSHeader
        left={
          <Link
            href={`/${slug}`}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-11)",
              color: "var(--ink-faint)",
              letterSpacing: "0.08em",
              textDecoration: "none",
              textTransform: "uppercase"
            }}
          >
            ← {competitor.name}
          </Link>
        }
      />

      <div style={{ marginBottom: 28 }}>
        <RDSKicker>{competitor.name}</RDSKicker>
        <h1
          style={{
            margin: "6px 0 4px",
            fontSize: "var(--fs-28)",
            fontWeight: 700,
            fontFamily: "var(--font-serif)",
            letterSpacing: "var(--tr-snug)"
          }}
        >
          Deep Dive
        </h1>
        <p style={{ margin: 0, color: "var(--ink-mute)", fontSize: "var(--fs-14)" }}>
          Autonomous multi-pass research — powered by Tabstack /research
        </p>
      </div>

      <DeepDiveClient competitorId={competitor.id} competitorName={competitor.name} />

      <div style={{ marginTop: 40 }}>
        <RDSSectionHead title="Previous Deep Dives" count={previousDeepDives.length} />
        {previousDeepDives.length === 0 ? (
          <RDSEmpty title="No previous deep dives" body="Run your first deep dive above." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {previousDeepDives.map((item) => (
              <div key={item.id} style={{ border: "1px solid var(--paper-rule)", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <RDSChip>{item.mode}</RDSChip>
                  <RDSChip>{getTemplateLabel(item.promptTemplate)}</RDSChip>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-11)",
                      color: "var(--ink-faint)",
                      marginLeft: "auto"
                    }}
                  >
                    {item.createdAt.toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "UTC"
                    })}{" "}
                    UTC
                  </span>
                </div>
                {item.result ? (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-12)",
                      color: "var(--ink-mute)",
                      lineHeight: "var(--lh-body)"
                    }}
                  >
                    {JSON.stringify(item.result).replace(/\s+/g, " ").slice(0, 200)}…
                  </p>
                ) : (
                  <p
                    style={{
                      margin: 0,
                      color: "var(--ink-faint)",
                      fontSize: "var(--fs-12)",
                      fontFamily: "var(--font-mono)"
                    }}
                  >
                    No saved result.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <RDSFooter />
    </RDSPageShell>
  );
}
