export type ParsedSseEvent = {
  event: string;
  data: unknown;
};

export function parseSseChunk(chunk: string): ParsedSseEvent[] {
  const blocks = chunk.split("\n\n").filter(Boolean);
  const parsed: ParsedSseEvent[] = [];

  for (const block of blocks) {
    // Skip SSE comment lines (e.g. ":keepalive" heartbeat pings)
    if (block.trimStart().startsWith(":")) continue;
    const lines = block.split("\n").filter((line) => !line.startsWith(":"));
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!eventLine || !dataLine) continue;

    const event = eventLine.slice("event:".length).trim();
    const raw = dataLine.slice("data:".length).trim();
    // Skip data values that are SSE keepalive strings rather than JSON payloads
    if (raw.startsWith(":")) continue;
    try {
      parsed.push({ event, data: JSON.parse(raw) });
    } catch {
      parsed.push({ event, data: raw });
    }
  }

  return parsed;
}
