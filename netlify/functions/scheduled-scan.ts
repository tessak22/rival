import type { Config } from "@netlify/functions";

export default async () => {
  await fetch(`${process.env.URL}/api/cron`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET! }
  });
};

export const config: Config = {
  schedule: "0 6 * * *"
};
