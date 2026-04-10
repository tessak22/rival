"use client";

import { useState } from "react";
import { parseSseChunk } from "@/lib/utils/sse";

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

export function DeepDiveClient({ competitorId, competitorName }: DeepDiveClientProps) {
  const [mode, setMode] = useState<"fast" | "balanced">("balanced");
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDeepDive() {
    setEvents([]);
    setResult(null);
    setCitations([]);
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/deep-dive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitorId, mode })
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
            const payload = parsed.data as { result?: unknown; citations?: Citation[] };
            setResult(payload.result ?? null);
            setCitations(Array.isArray(payload.citations) ? payload.citations : []);
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
            const payload = parsed.data as { result?: unknown; citations?: Citation[] };
            setResult(payload.result ?? null);
            setCitations(Array.isArray(payload.citations) ? payload.citations : []);
          }
          if (parsed.event === "research:error") {
            const payload = parsed.data as { error?: string };
            setError(payload?.error ?? "Deep dive failed");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deep dive request failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="deep-dive-layout">
      <section className="panel">
        <header className="panel-header">
          <h2>Run Deep Dive</h2>
        </header>
        <p className="muted">{competitorName}</p>
        <div className="mode-row">
          <label>
            <input type="radio" name="mode" checked={mode === "fast"} onChange={() => setMode("fast")} />
            Fast
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === "balanced"} onChange={() => setMode("balanced")} />
            Balanced
          </label>
          <button type="button" onClick={runDeepDive} disabled={isLoading}>
            {isLoading ? "Running..." : "Start research"}
          </button>
        </div>
        {error ? <p className="flag flag--error">{error}</p> : null}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Live Research Stream</h2>
        </header>
        {events.length === 0 ? (
          <p className="muted">No stream events yet.</p>
        ) : (
          <ul className="intel-feed">
            {events.map((event) => (
              <li key={event.id} className="intel-item">
                <div className="intel-item-top">
                  <strong>{event.event}</strong>
                </div>
                <pre className="json-view">{JSON.stringify(event.data, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Structured Report</h2>
        </header>
        {result ? (
          <pre className="json-view">{JSON.stringify(result, null, 2)}</pre>
        ) : (
          <p className="muted">No report yet.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Citations</h2>
        </header>
        {citations.length === 0 ? (
          <p className="muted">No citations yet.</p>
        ) : (
          <ul className="citation-list">
            {citations.map((citation, index) => (
              <li key={`${citation.source_url}-${index}`}>
                <details>
                  <summary>{citation.claim ?? `Citation ${index + 1}`}</summary>
                  <p>
                    <a href={citation.source_url} target="_blank" rel="noreferrer">
                      {citation.source_url}
                    </a>
                  </p>
                  {citation.source_text ? <p>{citation.source_text}</p> : null}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
