"use client";

import { useState } from "react";

type DemoEvent = {
  id: string;
  event: string;
  data: unknown;
};

function parseSseChunk(chunk: string): Array<{ event: string; data: unknown }> {
  const blocks = chunk.split("\n\n").filter(Boolean);
  const parsed: Array<{ event: string; data: unknown }> = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!eventLine || !dataLine) {
      parsed.push({
        event: "scan:error",
        data: { error: "Received malformed stream event from server." }
      });
      continue;
    }

    const event = eventLine.slice("event:".length).trim();
    const raw = dataLine.slice("data:".length).trim();
    try {
      parsed.push({ event, data: JSON.parse(raw) });
    } catch {
      parsed.push({ event, data: raw });
    }
  }
  return parsed;
}

export function DemoClient() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDemo() {
    setEvents([]);
    setError(null);
    setIsRunning(true);

    const response = await fetch("/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });

    if (!response.ok || !response.body) {
      setError(`Request failed (${response.status})`);
      setIsRunning(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const event of parseSseChunk(chunks.join("\n\n"))) {
          setEvents((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, event: event.event, data: event.data }]);
          if (event.event === "scan:error") {
            const payload = event.data as { error?: string };
            setError(payload?.error ?? "Demo scan failed");
          }
        }
      }

      if (buffer.trim()) {
        for (const event of parseSseChunk(buffer)) {
          setEvents((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, event: event.event, data: event.data }]);
          if (event.event === "scan:error") {
            const payload = event.data as { error?: string };
            setError(payload?.error ?? "Demo scan failed");
          }
        }
      }
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
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/pricing" />
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
