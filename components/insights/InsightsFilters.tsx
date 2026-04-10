"use client";

import { useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

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

  return (
    <form className="filters" onSubmit={applyFilters}>
      <label>
        Endpoint
        <select name="endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)}>
          <option value="">All</option>
          {endpointOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        Competitor
        <select name="competitorId" value={competitorId} onChange={(event) => setCompetitorId(event.target.value)}>
          <option value="">All</option>
          {competitors.map((competitor) => (
            <option key={competitor.id} value={competitor.id}>
              {competitor.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date from
        <input type="date" name="dateFrom" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
      </label>
      <label>
        Date to
        <input type="date" name="dateTo" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </label>
      <button type="submit">Apply filters</button>
    </form>
  );
}
