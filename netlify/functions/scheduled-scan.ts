import type { Config } from "@netlify/functions";

import { runScans } from "../../lib/run-scans";

export default async () => {
  await runScans();
};

export const config: Config = {
  schedule: "0 6 * * *"
};
