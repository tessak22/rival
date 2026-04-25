import Link from "next/link";

import { DemoClient } from "@/components/demo/DemoClient";
import { RDSFooter, RDSHeader, RDSKicker, RDSPageShell } from "@/components/rds";

export default function DemoPage() {
  return (
    <RDSPageShell>
      <RDSHeader
        left={
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--accent)",
              textDecoration: "underline"
            }}
          >
            ← Dashboard
          </Link>
        }
      />

      <RDSKicker>Tabstack API · Live Demo</RDSKicker>
      <h1
        style={{
          margin: "6px 0 4px",
          fontSize: "var(--fs-28)",
          fontWeight: 700,
          fontFamily: "var(--font-serif)",
          letterSpacing: "var(--tr-snug)"
        }}
      >
        Competitive Scanner
      </h1>
      <p style={{ margin: "0 0 32px", color: "var(--ink-mute)", fontSize: "var(--fs-14)" }}>
        Paste any public URL and Rival will run a live Tabstack scan — no account needed. 3 scans per IP per day.
      </p>

      <DemoClient />

      <RDSFooter />
    </RDSPageShell>
  );
}
