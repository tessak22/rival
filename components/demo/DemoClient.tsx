"use client";

import { useState } from "react";
import { parseSseChunk } from "@/lib/utils/sse";

type DemoEvent = {
  id: string;
  event: string;
  data: unknown;
};

export function DemoClient() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            const payload = event.data as { error?: string };
            setError(payload?.error ?? "Demo scan failed");
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
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Demo request failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="deep-dive-layout">
      <section className="panel">
        <header className="panel-header">
          <h2>Run Public Demo Scan</h2>
        </header>
        <div className="filters">
          <label>
            URL
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/pricing"
            />
          </label>
          <button type="button" onClick={runDemo} disabled={isRunning || !url.trim()}>
            {isRunning ? "Scanning..." : "Run demo"}
          </button>
        </div>
        {error ? <p className="flag flag--error">{error}</p> : null}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Live Progress</h2>
        </header>
        {events.length === 0 ? (
          <p className="muted">No events yet.</p>
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
    </div>
  );
}
