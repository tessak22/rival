"use client";

import { useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RDSButton } from "@/components/rds";

type InsightsFiltersProps = {
  endpoints: string[];
  competitors: Array<{ id: string; name: string }>;
  initial: {
    endpoint?: string;
    competitorId?: string;
    dateFrom?: string;
    dateTo?: string;
  };
};

const controlStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-12)",
  color: "var(--ink)",
  background: "var(--paper)",
  border: "1px solid var(--ink)",
  padding: "6px 10px",
  outline: "none",
  width: "100%"
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-10)",
  letterSpacing: "var(--tr-kicker)",
  textTransform: "uppercase",
  color: "var(--ink-faint)"
};

export function InsightsFilters({ endpoints, competitors, initial }: InsightsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [endpoint, setEndpoint] = useState(initial.endpoint ?? "");
  const [competitorId, setCompetitorId] = useState(initial.competitorId ?? "");
  const [dateFrom, setDateFrom] = useState(initial.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initial.dateTo ?? "");

  const endpointOptions = useMemo(() => [...new Set(endpoints)].sort(), [endpoints]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (endpoint) params.set("endpoint", endpoint);
    if (competitorId) params.set("competitorId", competitorId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function clearFilters() {
    setEndpoint("");
    setCompetitorId("");
    setDateFrom("");
    setDateTo("");
    router.push(pathname);
  }

  const hasFilters = endpoint || competitorId || dateFrom || dateTo;

  return (
    <form onSubmit={applyFilters}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          alignItems: "end"
        }}
      >
        <label style={labelStyle}>
          Endpoint
          <select style={controlStyle} name="endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
            <option value="">All</option>
            {endpointOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Competitor
          <select
            style={controlStyle}
            name="competitorId"
            value={competitorId}
            onChange={(e) => setCompetitorId(e.target.value)}
          >
            <option value="">All</option>
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Date from
          <input
            style={controlStyle}
            type="date"
            name="dateFrom"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Date to
          <input
            style={controlStyle}
            type="date"
            name="dateTo"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>

        <RDSButton type="submit" variant="solid" size="sm">
          Apply
        </RDSButton>

        {hasFilters && (
          <RDSButton variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </RDSButton>
        )}
      </div>
    </form>
  );
}
