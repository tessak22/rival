"use client";

import { useState } from "react";
import { parseSseChunk } from "@/lib/utils/sse";
import { DEEP_DIVE_TEMPLATES } from "@/lib/deep-dive-templates";
import type { DeepDiveTemplateKey } from "@/lib/deep-dive-templates";
import { RDSButton, RDSChip, RDSSectionHead } from "@/components/rds";

type DeepDiveClientProps = {
  competitorId: string;
  competitorName: string;
};

type ResearchEvent = {
  id: string;
  event: string;
  data: unknown;
};

type Citation = {
  claim?: string;
  source_url: string;
  source_text?: string;
};

type SelectedTemplate = DeepDiveTemplateKey | "general";

const GENERAL_TEMPLATE = {
  key: "general" as const,
  label: "General Research",
  description: "Full competitive profile — product, pricing, positioning, and recent activity"
};

const ALL_TEMPLATES = [GENERAL_TEMPLATE, ...DEEP_DIVE_TEMPLATES];

function getTemplateLabel(key: SelectedTemplate): string {
  if (key === "general") return GENERAL_TEMPLATE.label;
  const found = DEEP_DIVE_TEMPLATES.find((t) => t.key === key);
  return found?.label ?? "General Research";
}

function formatEventLabel(event: string): string {
  return event.replace("research:", "").replace(/_/g, " ");
}

export function DeepDiveClient({ competitorId, competitorName }: DeepDiveClientProps) {
  const [mode, setMode] = useState<"fast" | "balanced">("balanced");
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate>("general");
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedTemplate, setCompletedTemplate] = useState<SelectedTemplate | null>(null);
  const startTimeRef = { current: 0 };

  async function runDeepDive() {
    if (isLoading) return;
    setEvents([]);
    setResult(null);
    setCitations([]);
    setError(null);
    setCompletedTemplate(null);
    setIsLoading(true);
    startTimeRef.current = Date.now();

    const templateKey = selectedTemplate === "general" ? null : selectedTemplate;

    try {
      const response = await fetch("/api/deep-dive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitorId, competitorName, mode, promptTemplate: templateKey })
      });

      if (!response.ok || !response.body) {
        try {
          const body = (await response.json()) as { error?: string };
          setError(body.error ?? `Request failed (${response.status})`);
        } catch {
          setError(`Request failed (${response.status})`);
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const parsed of parseSseChunk(chunks.join("\n\n"))) {
          const id = `${Date.now()}-${Math.random()}`;
          setEvents((prev) => [...prev, { id, event: parsed.event, data: parsed.data }]);
          if (parsed.event === "research:complete" && parsed.data && typeof parsed.data === "object") {
            const payload = parsed.data as { result?: unknown; citations?: Citation[]; query?: string };
            setResult(payload.result ?? null);
            setCitations(Array.isArray(payload.citations) ? payload.citations : []);
            setCompletedTemplate(selectedTemplate);
            fetch("/api/deep-dive/save", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                competitorId,
                mode,
                query: payload.query ?? "",
                promptTemplate: selectedTemplate === "general" ? null : selectedTemplate,
                result: payload.result ?? null,
                citations: Array.isArray(payload.citations) ? payload.citations : [],
                durationMs: Date.now() - startTimeRef.current,
                status: "success"
              })
            }).catch(() => {
              /* non-fatal */
            });
          }
          if (parsed.event === "research:error") {
            const payload = parsed.data as { error?: string };
            setError(payload?.error ?? "Deep dive failed");
          }
        }
      }

      if (buffer.trim()) {
        for (const parsed of parseSseChunk(buffer)) {
          const id = `${Date.now()}-${Math.random()}`;
          setEvents((prev) => [...prev, { id, event: parsed.event, data: parsed.data }]);
          if (parsed.event === "research:complete" && parsed.data && typeof parsed.data === "object") {
            const payload = parsed.data as { result?: unknown; citations?: Citation[]; query?: string };
            setResult(payload.result ?? null);
            setCitations(Array.isArray(payload.citations) ? payload.citations : []);
            setCompletedTemplate(selectedTemplate);
            fetch("/api/deep-dive/save", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                competitorId,
                mode,
                query: payload.query ?? "",
                promptTemplate: selectedTemplate === "general" ? null : selectedTemplate,
                result: payload.result ?? null,
                citations: Array.isArray(payload.citations) ? payload.citations : [],
                durationMs: Date.now() - startTimeRef.current,
                status: "success"
              })
            }).catch(() => {
              /* non-fatal */
            });
          }
          if (parsed.event === "research:error") {
            const payload = parsed.data as { error?: string };
            setError(payload?.error ?? "Deep dive failed");
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deep dive request failed";
      // "Error in input stream" is a browser network error — typically a Netlify
      // function timeout on long-running balanced mode research.
      const isTimeout = msg.toLowerCase().includes("input stream") || msg.toLowerCase().includes("network");
      setError(
        isTimeout
          ? "Research timed out — try Fast mode (10–30s) or run again. Balanced mode (1–2min) may exceed the hosting limit."
          : msg
      );
    } finally {
      setIsLoading(false);
    }
  }

  const phaseEvents = events.filter(
    (e) => e.event !== "research:started" && e.event !== "research:complete" && e.event !== "research:error"
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Controls */}
      <div style={{ border: "1px solid var(--paper-rule)", padding: 20 }}>
        <RDSSectionHead title="Run Deep Dive" level={2} />

        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-10)",
              letterSpacing: "var(--tr-kicker)",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 10
            }}
          >
            Research focus
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {ALL_TEMPLATES.map((template) => {
              const selected = selectedTemplate === template.key;
              return (
                <label
                  key={template.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 12px",
                    border: `1px solid ${selected ? "var(--ink)" : "var(--paper-rule)"}`,
                    background: selected ? "var(--ink)" : "var(--paper)",
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="radio"
                    name="promptTemplate"
                    value={template.key}
                    checked={selected}
                    onChange={() => setSelectedTemplate(template.key as SelectedTemplate)}
                    style={{ display: "none" }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--fs-13)",
                      fontWeight: 600,
                      color: selected ? "var(--ink-bg-text)" : "var(--ink)"
                    }}
                  >
                    {template.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-11)",
                      color: selected ? "var(--ink-bg-mute)" : "var(--ink-faint)",
                      lineHeight: "var(--lh-body)"
                    }}
                  >
                    {template.description}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-10)",
              letterSpacing: "var(--tr-kicker)",
              textTransform: "uppercase",
              color: "var(--ink-faint)"
            }}
          >
            Mode
          </div>
          {(["fast", "balanced"] as const).map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-12)",
                  color: "var(--ink)"
                }}
              >
                {m === "fast" ? "Fast (10–30s)" : "Balanced (1–2min)"}
              </span>
            </label>
          ))}
          <div style={{ marginLeft: "auto" }}>
            <RDSButton variant="solid" size="md" onClick={runDeepDive} type="button">
              {isLoading ? "Running…" : `Research ${competitorName}`}
            </RDSButton>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              border: "1px solid var(--accent-hot)",
              color: "var(--accent-hot)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-12)"
            }}
          >
            {error}
          </div>
        )}
      </div>

      {(isLoading || phaseEvents.length > 0) && (
        <div style={{ border: "1px solid var(--paper-rule)", padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <RDSSectionHead title="Live Research Stream" level={2} />
            {isLoading && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-10)",
                  letterSpacing: "var(--tr-kicker)",
                  textTransform: "uppercase",
                  color: "var(--ok)"
                }}
              >
                ● live
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {phaseEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--paper-rule)"
                }}
              >
                <RDSChip style={{ flexShrink: 0 }}>
                  {formatEventLabel(
                    typeof (event.data as Record<string, unknown>)?.event === "string"
                      ? String((event.data as Record<string, unknown>).event)
                      : event.event
                  )}
                </RDSChip>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-11)",
                    color: "var(--ink-mute)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {(() => {
                    // Route wraps each event as { event, data } so the actual
                    // message lives at event.data.data.message
                    const d = event.data as Record<string, unknown> | null;
                    const inner = d?.data as Record<string, unknown> | undefined;
                    const msg =
                      typeof inner?.message === "string"
                        ? inner.message
                        : typeof d?.message === "string"
                          ? d.message
                          : null;
                    return msg ?? (d ? JSON.stringify(d).slice(0, 120) : "");
                  })()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {result !== null && result !== undefined && (
        <div style={{ border: "1px solid var(--paper-rule)", padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <RDSSectionHead title="Research Report" level={2} />
            {completedTemplate && <RDSChip>{getTemplateLabel(completedTemplate)}</RDSChip>}
          </div>
          {(() => {
            const r = result as Record<string, unknown>;
            const report = typeof r?.report === "string" ? r.report : typeof result === "string" ? result : null;
            const meta = r?.metadata as Record<string, unknown> | undefined;
            const mode = typeof meta?.mode === "string" ? meta.mode : null;
            const complexity = typeof meta?.queryComplexity === "string" ? meta.queryComplexity : null;
            const pagesAnalyzed = typeof meta?.totalPagesAnalyzed === "number" ? meta.totalPagesAnalyzed : null;

            return (
              <>
                {(mode || complexity || pagesAnalyzed) && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    {mode && <RDSChip>{mode} mode</RDSChip>}
                    {complexity && <RDSChip>{complexity} complexity</RDSChip>}
                    {pagesAnalyzed != null && <RDSChip>{pagesAnalyzed} pages analyzed</RDSChip>}
                  </div>
                )}
                {report ? (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-serif)",
                      fontSize: "var(--fs-14)",
                      lineHeight: "var(--lh-body)",
                      color: "var(--ink)"
                    }}
                  >
                    {report}
                  </p>
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-11)",
                      lineHeight: "var(--lh-body)",
                      color: "var(--ink)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word"
                    }}
                  >
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Citations */}
      {citations.length > 0 && (
        <div style={{ border: "1px solid var(--paper-rule)", padding: 20 }}>
          <RDSSectionHead title="Citations" count={citations.length} level={2} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {citations.map((citation, index) => (
              <details
                key={`${citation.source_url}-${index}`}
                style={{ borderBottom: "1px solid var(--paper-rule)", paddingBottom: 8 }}
              >
                <summary
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-12)",
                    color: "var(--ink)",
                    cursor: "pointer",
                    listStyle: "none",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start"
                  }}
                >
                  <span style={{ color: "var(--ink-faint)", flexShrink: 0 }}>{index + 1}.</span>
                  <span>{citation.claim ?? citation.source_url}</span>
                </summary>
                <div style={{ marginTop: 8, paddingLeft: 20 }}>
                  <a
                    href={citation.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-11)",
                      color: "var(--accent)",
                      wordBreak: "break-all"
                    }}
                  >
                    {citation.source_url}
                  </a>
                  {citation.source_text && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontFamily: "var(--font-serif)",
                        fontSize: "var(--fs-13)",
                        color: "var(--ink-mute)",
                        lineHeight: "var(--lh-body)"
                      }}
                    >
                      {citation.source_text}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
