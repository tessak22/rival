// Filename suffix `-background` is load-bearing: it tells Netlify to run this
// as a background function (15 min timeout) rather than a synchronous one
// (~10-30 sec). `runScans` processes every competitor × every page serially
// within a chunk and needs the longer window — without `-background`, the
// function is killed after the first chunk of 3 competitors, leaving the
// remaining rows stale (see: https://docs.netlify.com/functions/background-functions/).
import type { Config } from "@netlify/functions";

import { runScans } from "../../lib/run-scans";

export default async () => {
  await runScans();
};

export const config: Config = {
  schedule: "0 6 * * *"
};
