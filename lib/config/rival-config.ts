export type RivalConfigEntry = {
  name: string;
  slug: string;
  url: string;
  manual?: Record<string, unknown> & { manual_last_updated?: string };
  pages?: Array<{
    label: string;
    url: string;
    type: string;
    geo_target?: string;
  }>;
};

export type ParsedRivalConfig = {
  self: RivalConfigEntry | null;
  competitors: RivalConfigEntry[];
};

type RawConfig = {
  self?: RivalConfigEntry;
  competitors?: RivalConfigEntry[];
};

export function parseRivalConfig(raw: RawConfig): ParsedRivalConfig {
  const self = raw.self ?? null;
  const competitors = raw.competitors ?? [];

  if (self) {
    const collision = competitors.find((c) => c.slug === self.slug);
    if (collision) {
      throw new Error(
        `rivals.config.json: slug collision between self and competitor "${self.slug}". Choose a different slug for one of them.`
      );
    }
  }

  return { self, competitors };
}
