"use client";

import { useState } from "react";

import { RDSButton, RDSChip, RDSKicker, RDSSectionHead } from "@/components/rds";
import { parseSseChunk } from "@/lib/utils/sse";

type DemoEvent = {
  id: string;
  event: string;
  data: unknown;
};

type ScanCompleteData = {
  endpointUsed?: string;
  usedFallback?: boolean;
  result?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ResultValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span style={{ color: value ? "var(--ok)" : "var(--accent-hot)", fontWeight: 600 }}>{value ? "Yes" : "No"}</span>
    );
  }
  if (typeof value === "number") {
    return <span style={{ fontWeight: 600 }}>{value}</span>;
  }
  if (typeof value === "string") {
    return <span>{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>None</span>;
    if (value.every((v) => typeof v === "string")) {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {(value as string[]).map((v, i) => (
            <span
              key={i}
              style={{
                padding: "3px 9px",
                background: "var(--paper-tint)",
                border: "1px solid var(--paper-rule)",
                fontFamily: "var(--font-sans)",
                fontSize: 12
              }}
            >
              {v}
            </span>
          ))}
        </div>
      );
    }
    return (
      <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {value.map((v, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 3 }}>
            {isObject(v) ? <ResultObject data={v} /> : <ResultValue value={v} />}
          </li>
        ))}
      </ol>
    );
  }
  if (isObject(value)) {
    return <ResultObject data={value} />;
  }
  return <span>{String(value)}</span>;
}

function ResultObject({ data }: { data: Record<string, unknown> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-faint)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              flexShrink: 0,
              minWidth: 120
            }}
          >
            {k.replace(/_/g, " ")}
          </span>
          <span style={{ fontSize: 13, color: "var(--ink)" }}>
            <ResultValue value={v} />
          </span>
        </div>
      ))}
    </div>
  );
}

function ScanResult({ data }: { data: ScanCompleteData }) {
  const result = data.result;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {data.endpointUsed && <RDSChip tone="solid">{data.endpointUsed}</RDSChip>}
        {data.usedFallback && <RDSChip tone="hot">Fallback triggered</RDSChip>}
        {!data.usedFallback && <RDSChip tone="ok">No fallback</RDSChip>}
      </div>

      {isObject(result) && Object.keys(result).length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {Object.entries(result).map(([key, value]) => {
            const isEmpty =
              value === null ||
              value === undefined ||
              (Array.isArray(value) && value.length === 0) ||
              (typeof value === "string" && value.trim().length === 0) ||
              (typeof value === "number" && value === 0);
            return (
              <div
                key={key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 1fr",
                  gap: 16,
                  padding: "12px 0",
                  borderBottom: "1px dotted var(--paper-rule-2)",
                  alignItems: "start",
                  opacity: isEmpty ? 0.45 : 1
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    color: "var(--ink-faint)",
                    textTransform: "uppercase",
                    paddingTop: 3
                  }}
                >
                  {key.replace(/_/g, " ")}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink)" }}>
                  <ResultValue value={value} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic", fontSize: 14, margin: 0 }}>
          No structured data extracted — page may have blocked the scan.
        </p>
      )}
    </div>
  );
}

const ENDPOINT_LABELS: Record<string, string> = {
  "extract/json": "extract/json — structured data",
  "extract/markdown": "extract/markdown — page content",
  automate: "automate — browser agent",
  generate: "generate — AI synthesis"
};

function ProgressLog({ events, isRunning }: { events: DemoEvent[]; isRunning: boolean }) {
  const startedEvent = events.find((e) => e.event === "scan:started");
  const endpointEvent = events.find((e) => e.event === "scan:endpoint");
  const completeEvent = events.find((e) => e.event === "scan:complete");
  const complete = completeEvent?.data as ScanCompleteData | undefined;

  const pageType = (endpointEvent?.data as { type?: string })?.type ?? "";
  const endpointUsed = complete?.endpointUsed ?? "";
  const usedFallback = complete?.usedFallback ?? false;

  const steps: Array<{ label: string; detail: string; done: boolean; running?: boolean }> = [
    {
      label: "Scan started",
      detail: (startedEvent?.data as { url?: string })?.url ?? "",
      done: Boolean(startedEvent)
    },
    {
      label: "Page type inferred",
      detail: pageType,
      done: Boolean(endpointEvent)
    },
    {
      label:
        endpointEvent && !completeEvent
          ? `Extracting via ${pageType}…`
          : completeEvent
            ? `Extracted via ${ENDPOINT_LABELS[endpointUsed] ?? endpointUsed}`
            : "Extraction",
      detail: usedFallback ? "Fallback triggered — primary extraction was empty or blocked" : "",
      done: Boolean(completeEvent),
      running: Boolean(endpointEvent) && !completeEvent && isRunning
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((step, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 14,
            padding: "10px 0",
            borderBottom: "1px dotted var(--paper-rule-2)",
            opacity: step.done || step.running ? 1 : 0.35
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: step.done ? "var(--ok)" : step.running ? "var(--accent)" : "var(--ink-faint)",
              width: 16,
              flexShrink: 0
            }}
          >
            {step.done ? "✓" : step.running ? "→" : "·"}
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{step.label}</div>
            {step.detail && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ink-faint)",
                  marginTop: 2,
                  wordBreak: "break-all"
                }}
              >
                {step.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DemoClient() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeEvent = events.find((e) => e.event === "scan:complete");
  const hasResult = Boolean(completeEvent);

  async function runDemo() {
    setEvents([]);
    setError(null);
    setIsRunning(true);

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
            setError((event.data as { error?: string })?.error ?? "Demo scan failed");
          }
          if (event.event === "scan:timeout") {
            setError((event.data as { message?: string })?.message ?? "Scan timed out — try a simpler page type.");
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
            setError((event.data as { error?: string })?.error ?? "Demo scan failed");
          }
          if (event.event === "scan:timeout") {
            setError((event.data as { message?: string })?.message ?? "Scan timed out — try a simpler page type.");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo request failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div>
      {/* URL input */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          padding: "20px 24px",
          background: "var(--paper-tint)",
          border: "1px solid var(--paper-rule)",
          marginBottom: 28
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 6
            }}
          >
            URL to scan
          </div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && !isRunning) void runDemo();
            }}
            placeholder="https://example.com/pricing"
            style={{
              width: "100%",
              padding: "9px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              background: "var(--paper)",
              border: "1px solid var(--ink)",
              color: "var(--ink)",
              outline: "none",
              boxSizing: "border-box"
            }}
          />
        </div>
        <RDSButton
          onClick={() => void runDemo()}
          variant="solid"
          size="md"
          style={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {isRunning ? "Scanning…" : "Run scan →"}
        </RDSButton>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fff0ec",
            border: "1px solid var(--accent-hot)",
            color: "var(--accent-hot)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            marginBottom: 24
          }}
        >
          {error}
        </div>
      )}

      {/* Progress + result */}
      {events.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: hasResult ? "1fr 2fr" : "1fr", gap: 32 }}>
          <div>
            <RDSSectionHead title="Progress" level={3} />
            <ProgressLog events={events} isRunning={isRunning} />
          </div>

          {hasResult && completeEvent && (
            <div>
              <RDSSectionHead title="Extracted Data" level={3} />
              <ScanResult data={completeEvent.data as ScanCompleteData} />
            </div>
          )}
        </div>
      )}

      {events.length === 0 && !isRunning && !error && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            border: "1px dashed var(--paper-rule-2)"
          }}
        >
          <RDSKicker style={{ justifyContent: "center", display: "flex", marginBottom: 8 }}>
            Try a competitor URL
          </RDSKicker>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--ink-mute)",
              lineHeight: 1.6
            }}
          >
            Homepage, pricing, blog, docs, careers, GitHub — Rival infers the page type and picks the right endpoint
            automatically.
          </p>
        </div>
      )}
    </div>
  );
}
