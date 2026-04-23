export type ParsedSseEvent = {
  event: string;
  data: unknown;
};

export function parseSseChunk(chunk: string): ParsedSseEvent[] {
  const blocks = chunk.split("\n\n").filter(Boolean);
  const parsed: ParsedSseEvent[] = [];

  for (const block of blocks) {
    // Skip SSE comment-only blocks (e.g. ":keepalive")
    if (block.trimStart().startsWith(":")) continue;
    const lines = block.split("\n").filter((line) => !line.startsWith(":"));
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!dataLine) continue;

    const raw = dataLine.slice("data:".length).trim();
    // Skip keepalive data values (e.g. "data: :keepalive")
    if (raw.startsWith(":")) continue;

    if (eventLine) {
      // Standard SSE: explicit event type on its own line
      const event = eventLine.slice("event:".length).trim();
      try {
        parsed.push({ event, data: JSON.parse(raw) });
      } catch {
        parsed.push({ event, data: raw });
      }
    } else {
      // Data-only SSE (Tabstack format): event type is embedded in the JSON body
      // e.g. data: {"event":"complete","data":{...}}
      try {
        const body = JSON.parse(raw) as Record<string, unknown>;
        const event = typeof body.event === "string" ? body.event : "message";
        const data = "data" in body ? body.data : body;
        parsed.push({ event, data });
      } catch {
        // Unparseable data line — skip
      }
    }
  }

  return parsed;
}
