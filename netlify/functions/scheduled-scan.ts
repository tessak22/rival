import type { Config } from "@netlify/functions";

export default async () => {
  const url = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) {
    throw new Error("URL and CRON_SECRET env vars are required");
  }
  const res = await fetch(`${url}/api/cron`, {
    method: "POST",
    headers: { "x-cron-secret": secret }
  });
  if (!res.ok) {
    throw new Error(`/api/cron responded ${res.status}`);
  }
};

export const config: Config = {
  schedule: "0 6 * * *"
};
