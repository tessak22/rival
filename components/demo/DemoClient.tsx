"use client";

import { useState } from "react";
import { parseSseChunk } from "@/lib/utils/sse";
import { RDSChip, RDSSectionHead } from "@/components/rds";

type DemoEvent = {
  id: string;
  event: string;
  data: unknown;
};

type ScanCompleteData = {
  endpointUsed: string;
  usedFallback: boolean;
  diffSummary: string | null;
  hasChanges: boolean;
  result: unknown;
};

type ScanSurfaces = {
  pages: Array<{ type: string; url: string }>;
};

type PageCompleteData = {
  type: string;
  url: string;
  result: unknown;
  endpointUsed: string;
  usedFallback: boolean;
};

type BriefData = {
  positioning_signal: string;
  opportunity: string;
  watch_signal: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

const kvLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  color: "var(--ink-faint)",
  fontWeight: 600,
  marginBottom: 4,
  textTransform: "uppercase"
};

function FieldValue({ value }: { value: unknown }): React.ReactNode {
  if (typeof value === "boolean") {
    return <span style={{ color: value ? "var(--ok)" : "var(--accent-hot)" }}>{value ? "Yes" : "No"}</span>;
  }
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== null && v !== undefined);
    if (isObject(items[0])) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                padding: "6px 0",
                borderBottom: "1px dotted var(--paper-rule-2)"
              }}
            >
              {isObject(item)
                ? Object.entries(item)
                    .filter(([, v]) => !isEmpty(v))
                    .map(([k, v]) => (
                      <span key={k} style={{ marginRight: 12 }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            color: "var(--ink-faint)",
                            marginRight: 4
                          }}
                        >
                          {k.replace(/_/g, " ")}
                        </span>
                        {String(v)}
                      </span>
                    ))
                : String(item)}
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul style={{ margin: 0, paddingLeft: 16, listStyle: "disc" }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 2 }}>
            {String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (isObject(value)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(value)
          .filter(([, v]) => !isEmpty(v))
          .map(([k, v]) => (
            <div key={k} style={{ fontSize: 13 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-faint)", marginRight: 6 }}>
                {k.replace(/_/g, " ")}
              </span>
              {String(v)}
            </div>
          ))}
      </div>
    );
  }
  return <span style={{ fontSize: 14, lineHeight: 1.55 }}>{String(value)}</span>;
}

function ExtractedFields({ result }: { result: unknown }) {
  if (!isObject(result) || Object.keys(result).length === 0) {
    return (
      <p style={{ color: "var(--ink-faint)", fontStyle: "italic", fontSize: 14, margin: 0 }}>
        No data extracted — page may have blocked the scan.
      </p>
    );
  }
  const entries = Object.entries(result).filter(([, v]) => !isEmpty(v));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {entries.map(([key]) => (
        <div key={key} style={{ padding: "12px 0", borderBottom: "1px dotted var(--paper-rule-2)" }}>
          <div style={kvLabel}>{key.replace(/_/g, " ")}</div>
          <FieldValue value={result[key]} />
        </div>
      ))}
    </div>
  );
}

function ScanResult({ data }: { data: ScanCompleteData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <RDSChip tone="solid">{data.endpointUsed}</RDSChip>
        {data.usedFallback && <RDSChip tone="hot">Fallback triggered</RDSChip>}
        {data.hasChanges && <RDSChip tone="ok">Changes detected</RDSChip>}
      </div>
      <ExtractedFields result={data.result} />
    </div>
  );
}

function ProgressLog({ events, isRunning }: { events: DemoEvent[]; isRunning: boolean }) {
  const labels: Record<string, string> = {
    "scan:started": "Scan started",
    "scan:endpoint": "Endpoint selected",
    "scan:complete": "Scan complete",
    "scan:error": "Error",
    "scan:timeout": "Timed out"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.map((e) => {
        const label = labels[e.event] ?? e.event;
        const isError = e.event === "scan:error" || e.event === "scan:timeout";
        const isComplete = e.event === "scan:complete";
        const color = isError ? "var(--accent-hot)" : isComplete ? "var(--ok)" : "var(--ink)";
        return (
          <div
            key={e.id}
            style={{
              display: "flex",
              gap: 14,
              padding: "10px 0",
              borderBottom: "1px dotted var(--paper-rule-2)"
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color,
                width: 16,
                flexShrink: 0
              }}
            >
              {isError ? "✗" : isComplete ? "✓" : "→"}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
              {e.event === "scan:started" && isObject(e.data) && typeof e.data.url === "string" && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-faint)",
                    marginTop: 2,
                    wordBreak: "break-all"
                  }}
                >
                  {e.data.url}
                </div>
              )}
              {e.event === "scan:endpoint" && isObject(e.data) && typeof e.data.type === "string" && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-faint)",
                    marginTop: 2
                  }}
                >
                  {e.data.type}
                </div>
              )}
              {isError && isObject(e.data) && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--accent-hot)",
                    marginTop: 2
                  }}
                >
                  {typeof e.data.error === "string"
                    ? e.data.error
                    : typeof e.data.message === "string"
                      ? e.data.message
                      : ""}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {isRunning && (
        <div
          style={{
            display: "flex",
            gap: 14,
            padding: "10px 0"
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--accent)",
              width: 16,
              flexShrink: 0
            }}
          >
            ·
          </span>
          <div style={{ fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic" }}>Scanning…</div>
        </div>
      )}
    </div>
  );
}

function MultiSurfaceProgressLog({
  surfaces,
  pageResults,
  briefPending,
  brief,
  isRunning,
  startedUrl,
  events
}: {
  surfaces: Array<{ type: string; url: string }>;
  pageResults: PageCompleteData[];
  briefPending: boolean;
  brief: BriefData | null;
  events: DemoEvent[];
  isRunning: boolean;
  startedUrl: string;
}) {
  const completedTypes = new Set(pageResults.map((r) => r.type));
  const skippedTypes = new Set(
    events
      .filter((e) => e.event === "scan:page_skipped" && isObject(e.data) && typeof e.data.type === "string")
      .map((e) => (e.data as { type: string }).type)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <ProgressRow symbol="✓" tone="ok" label="Scan started" detail={startedUrl} done />
      <ProgressRow
        symbol="✓"
        tone="ok"
        label={`Scanning ${surfaces.length} surfaces`}
        detail={surfaces.map((s) => s.type).join(" · ")}
        done
      />
      {surfaces.map(({ type }) => {
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        const done = completedTypes.has(type);
        const skipped = skippedTypes.has(type);
        const running = isRunning && !done && !skipped;
        return (
          <ProgressRow
            key={type}
            symbol={done ? "✓" : skipped ? "·" : running ? "→" : "·"}
            tone={done ? "ok" : running ? "accent" : "faint"}
            label={
              done
                ? `${label} — extracted`
                : skipped
                  ? `${label} — not found`
                  : running
                    ? `${label} — extracting…`
                    : label
            }
            detail=""
            done={done || skipped}
          />
        );
      })}
      {(briefPending || brief) && (
        <ProgressRow
          symbol={brief ? "✓" : "→"}
          tone={brief ? "ok" : "accent"}
          label={brief ? "Intelligence brief — complete" : "Synthesizing brief…"}
          detail=""
          done={Boolean(brief)}
        />
      )}
    </div>
  );
}

function ProgressRow({
  symbol,
  tone,
  label,
  detail,
  done
}: {
  symbol: string;
  tone: "ok" | "accent" | "faint";
  label: string;
  detail: string;
  done: boolean;
}) {
  const color = tone === "ok" ? "var(--ok)" : tone === "accent" ? "var(--accent)" : "var(--ink-faint)";
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px dotted var(--paper-rule-2)",
        opacity: done || tone === "accent" ? 1 : 0.35
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color, width: 16, flexShrink: 0 }}>{symbol}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {detail && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-faint)",
              marginTop: 2,
              wordBreak: "break-all"
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function MultiSurfaceResults({ pageResults }: { pageResults: PageCompleteData[] }) {
  if (pageResults.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {pageResults.map((page) => (
        <div key={page.type}>
          <RDSSectionHead title={page.type.charAt(0).toUpperCase() + page.type.slice(1)} count={page.endpointUsed} />
          {page.usedFallback && (
            <div style={{ marginBottom: 8 }}>
              <RDSChip tone="hot">Fallback triggered</RDSChip>
            </div>
          )}
          <ExtractedFields result={page.result} />
        </div>
      ))}
    </div>
  );
}

function BriefSection({ brief }: { brief: BriefData }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "POSITIONING SIGNAL", value: brief.positioning_signal },
    { label: "OPPORTUNITY", value: brief.opportunity },
    { label: "WATCH", value: brief.watch_signal }
  ];
  return (
    <div
      style={{
        marginTop: 32,
        padding: "20px 24px",
        background: "var(--ink)",
        color: "var(--ink-bg-text)"
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "var(--ink-ghost)",
          marginBottom: 16
        }}
      >
        INTELLIGENCE BRIEF
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.map(({ label, value }) => (
          <div
            key={label}
            style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr",
              gap: 16,
              padding: "12px 0",
              borderTop: "1px solid var(--ink-2)"
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "var(--ink-ghost)",
                paddingTop: 2
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, textWrap: "pretty" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoClient() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surfaces, setSurfaces] = useState<Array<{ type: string; url: string }>>([]);
  const [pageResults, setPageResults] = useState<PageCompleteData[]>([]);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [briefPending, setBriefPending] = useState(false);

  async function runDemo() {
    setEvents([]);
    setError(null);
    setIsRunning(true);
    setSurfaces([]);
    setPageResults([]);
    setBrief(null);
    setBriefPending(false);

    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
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

        for (const event of parseSseChunk(chunks.join("\n\n"))) {
          setEvents((prev) => [
            ...prev,
            { id: `${Date.now()}-${Math.random()}`, event: event.event, data: event.data }
          ]);
          if (event.event === "scan:error") {
            const payload = event.data as { error?: string };
            setError(payload?.error ?? "Demo scan failed");
          }
          if (event.event === "scan:surfaces") {
            setSurfaces((event.data as ScanSurfaces).pages);
          }
          if (event.event === "scan:page_complete") {
            setPageResults((prev) => [...prev, event.data as PageCompleteData]);
          }
          if (event.event === "scan:brief_started") {
            setBriefPending(true);
          }
          if (event.event === "scan:brief_complete") {
            setBrief(event.data as BriefData);
            setBriefPending(false);
          }
        }
      }

      if (buffer.trim()) {
        for (const event of parseSseChunk(buffer)) {
          setEvents((prev) => [
            ...prev,
            { id: `${Date.now()}-${Math.random()}`, event: event.event, data: event.data }
          ]);
          if (event.event === "scan:error") {
            const payload = event.data as { error?: string };
            setError(payload?.error ?? "Demo scan failed");
          }
          if (event.event === "scan:surfaces") {
            setSurfaces((event.data as ScanSurfaces).pages);
          }
          if (event.event === "scan:page_complete") {
            setPageResults((prev) => [...prev, event.data as PageCompleteData]);
          }
          if (event.event === "scan:brief_started") {
            setBriefPending(true);
          }
          if (event.event === "scan:brief_complete") {
            setBrief(event.data as BriefData);
            setBriefPending(false);
          }
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Demo request failed");
    } finally {
      setIsRunning(false);
    }
  }

  const completeEvent = events.find((e) => e.event === "scan:complete");
  const isMultiSurface = surfaces.length > 0;
  const hasResult = isMultiSurface ? pageResults.length > 0 || briefPending : Boolean(completeEvent);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div
        style={{
          background: "var(--paper-edge)",
          padding: "20px 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-mute)"
            }}
          >
            URL to scan
          </span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isRunning && url.trim() && runDemo()}
            placeholder="https://example.com/pricing"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              padding: "10px 14px",
              border: "1px solid var(--ink)",
              background: "var(--paper)",
              color: "var(--ink)",
              width: "100%"
            }}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="button"
            onClick={runDemo}
            disabled={isRunning || !url.trim()}
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: 14,
              padding: "10px 20px",
              background: isRunning || !url.trim() ? "var(--paper-rule-2)" : "var(--ink)",
              color: isRunning || !url.trim() ? "var(--ink-faint)" : "var(--ink-bg-text)",
              border: "none",
              cursor: isRunning || !url.trim() ? "not-allowed" : "pointer",
              letterSpacing: "0.01em"
            }}
          >
            {isRunning ? "Scanning…" : "Run scan →"}
          </button>
          {error ? (
            <span
              style={{
                fontSize: 13,
                color: "var(--accent-hot)",
                fontFamily: "var(--font-mono)"
              }}
            >
              {error}
            </span>
          ) : null}
        </div>
      </div>

      {events.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: (isMultiSurface && hasResult) || (!isMultiSurface && hasResult) ? "1fr 2fr" : "1fr",
            gap: 32
          }}
        >
          <div>
            <RDSSectionHead title="Progress" level={3} />
            {isMultiSurface ? (
              <MultiSurfaceProgressLog
                surfaces={surfaces}
                pageResults={pageResults}
                briefPending={briefPending}
                brief={brief}
                isRunning={isRunning}
                events={events}
                startedUrl={(events.find((e) => e.event === "scan:started")?.data as { url?: string })?.url ?? ""}
              />
            ) : (
              <ProgressLog events={events} isRunning={isRunning} />
            )}
          </div>

          {isMultiSurface && (pageResults.length > 0 || brief) && (
            <div>
              <RDSSectionHead title="Extracted Data" level={3} />
              <MultiSurfaceResults pageResults={pageResults} />
              {brief && <BriefSection brief={brief} />}
            </div>
          )}

          {!isMultiSurface && hasResult && completeEvent && (
            <div>
              <RDSSectionHead title="Extracted Data" level={3} />
              <ScanResult data={completeEvent.data as ScanCompleteData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
