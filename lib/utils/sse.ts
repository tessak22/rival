export type ParsedSseEvent = {
  event: string;
  data: unknown;
};

export function parseSseChunk(chunk: string): ParsedSseEvent[] {
  const blocks = chunk.split("\n\n").filter(Boolean);
  const parsed: ParsedSseEvent[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!eventLine || !dataLine) continue;

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

