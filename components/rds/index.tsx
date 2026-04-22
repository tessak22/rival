// ──────────────────────────────────────────────────────────────────
// Rival Design System — shared primitives used by every page.
// All values reference tokens in app/globals.css via var(--token), so
// any future page/feature that drops these in inherits the system.
// ──────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";

// ── helpers ──────────────────────────────────────────────────────

export function rdsHealthColor(h: number): string {
  if (h >= 85) return "var(--ok)";
  if (h >= 75) return "var(--warn)";
  return "var(--accent-hot)";
}

export function rdsTierLabel(t: string | null | undefined): "HIGH" | "MED" | "LOW" {
  const v = (t ?? "").toLowerCase();
  if (v === "high") return "HIGH";
  if (v === "medium" || v === "med") return "MED";
  return "LOW";
}

// ── Wordmark ─────────────────────────────────────────────────────

type WordmarkProps = { size?: number };

export function RDSWordmark({ size = 54 }: WordmarkProps) {
  return (
    <span
      style={{
        fontFamily: "var(--font-serif)",
        fontSize: size,
        fontWeight: 600,
        lineHeight: 0.88,
        letterSpacing: "var(--tr-tight)",
        fontFeatureSettings: "'ss01', 'dlig'",
        color: "var(--ink)",
        display: "inline-block"
      }}
    >
      Rival
    </span>
  );
}

// ── Eyebrow / Kicker ─────────────────────────────────────────────

type KickerProps = { children: ReactNode; hot?: boolean; style?: CSSProperties };

export function RDSKicker({ children, hot, style }: KickerProps) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-10)",
        letterSpacing: hot ? "var(--tr-kicker-hot)" : "var(--tr-kicker)",
        textTransform: "uppercase",
        color: hot ? "var(--accent-hot)" : "var(--ink-faint)",
        ...style
      }}
    >
      {children}
    </div>
  );
}

// ── Section head ─────────────────────────────────────────────────

type SectionHeadProps = {
  title: string;
  count?: ReactNode;
  eyebrow?: ReactNode;
  level?: 2 | 3 | 4;
};

export function RDSSectionHead({ title, count, eyebrow, level = 2 }: SectionHeadProps) {
  const headingStyle: CSSProperties = {
    margin: 0,
    fontSize: "var(--fs-20)",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "var(--ink)",
    fontFamily: "var(--font-serif)"
  };
  const heading =
    level === 2 ? (
      <h2 style={headingStyle}>{title}</h2>
    ) : level === 3 ? (
      <h3 style={headingStyle}>{title}</h3>
    ) : (
      <h4 style={headingStyle}>{title}</h4>
    );
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
      {eyebrow != null && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-10)",
            letterSpacing: "var(--tr-kicker)",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            alignSelf: "baseline"
          }}
        >
          {eyebrow}
        </span>
      )}
      {heading}
      <div style={{ flex: 1, height: 1, background: "var(--ink)" }} />
      {count != null && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-10)",
            color: "var(--ink-faint)",
            letterSpacing: "0.08em",
            textTransform: "uppercase"
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ── Chip ─────────────────────────────────────────────────────────

type ChipTone = "default" | "solid" | "ok" | "hot";

export function RDSChip({
  children,
  tone = "default",
  style
}: {
  children: ReactNode;
  tone?: ChipTone;
  style?: CSSProperties;
}) {
  const bg = tone === "solid" ? "var(--ink)" : "transparent";
  const border = tone === "ok" ? "var(--ok)" : tone === "hot" ? "var(--accent-hot)" : "var(--ink)";
  const fg =
    tone === "solid"
      ? "var(--ink-bg-text)"
      : tone === "ok"
        ? "var(--ok)"
        : tone === "hot"
          ? "var(--accent-hot)"
          : "var(--ink)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-10)",
        letterSpacing: "0.08em",
        padding: "3px 8px",
        border: `1px solid ${border}`,
        background: bg,
        color: fg,
        textTransform: "uppercase",
        ...style
      }}
    >
      {children}
    </span>
  );
}

// ── Diff pills (+add / −remove) ──────────────────────────────────

export function RDSDiffPills({
  added = 0,
  removed = 0,
  inline
}: {
  added?: number;
  removed?: number;
  inline?: boolean;
}) {
  const base: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--fs-11)",
    fontWeight: 600,
    letterSpacing: "0.04em"
  };
  return (
    <span style={{ display: inline ? "inline-flex" : "flex", gap: 10, ...base }}>
      {added > 0 && <span style={{ color: "var(--ok)" }}>+{added}</span>}
      {removed > 0 && <span style={{ color: "var(--accent-hot)" }}>−{removed}</span>}
      {added === 0 && removed === 0 && <span style={{ color: "var(--ink-faint)" }}>NO CHANGE</span>}
    </span>
  );
}

// ── Live dot ─────────────────────────────────────────────────────

export function RDSLiveDot({ label = "live" }: { label?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-11)",
        color: "var(--ok)",
        letterSpacing: "0.1em",
        fontWeight: 600
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--ok)",
          boxShadow: "0 0 0 3px rgba(58,107,58,0.15)"
        }}
      />
      {label}
    </span>
  );
}

// ── Sparkline ────────────────────────────────────────────────────

export function RDSMiniLine({
  data,
  w = 180,
  h = 44,
  color = "var(--ink)"
}: {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const lastY = h - ((data[data.length - 1] - min) / range) * (h - 6) - 3;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polygon points={area} fill={color} opacity="0.07" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={w} cy={lastY} r="3" fill={color} />
    </svg>
  );
}

// ── Button ───────────────────────────────────────────────────────

type ButtonVariant = "solid" | "paper" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export function RDSButton({
  children,
  href,
  onClick,
  variant = "solid",
  size = "md",
  style,
  type,
  target,
  rel
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: CSSProperties;
  type?: "button" | "submit";
  target?: string;
  rel?: string;
}) {
  const sizes: Record<ButtonSize, CSSProperties> = {
    sm: { padding: "6px 10px", fontSize: "var(--fs-12)" },
    md: { padding: "10px 14px", fontSize: "var(--fs-13)" },
    lg: { padding: "12px 18px", fontSize: "var(--fs-14)" }
  };
  const variants: Record<ButtonVariant, CSSProperties> = {
    solid: { background: "var(--ink)", color: "var(--ink-bg-text)", border: "1px solid var(--ink)" },
    paper: { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--ink)" },
    ghost: { background: "transparent", color: "var(--ink)", border: "1px solid var(--ink)" }
  };
  const s: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    transition: "opacity var(--dur-fast) var(--ease)",
    ...sizes[size],
    ...variants[variant],
    ...style
  };
  if (href) {
    const external = /^https?:\/\//i.test(href);
    if (external) {
      return (
        <a href={href} target={target} rel={rel} style={s}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} style={s}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} type={type ?? "button"} style={s}>
      {children}
    </button>
  );
}

// ── Breadcrumb row ───────────────────────────────────────────────

type CrumbItem = { label: string; href?: string };

export function RDSCrumbs({ items }: { items: CrumbItem[] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-13)",
        color: "var(--ink-mute)"
      }}
    >
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        const textStyle: CSSProperties = {
          color: isLast ? "var(--ink)" : "var(--accent)",
          fontWeight: isLast ? 600 : 500,
          textDecoration: "none",
          cursor: it.href ? "pointer" : "default"
        };
        return (
          <Fragment key={i}>
            {i > 0 && <span style={{ color: "var(--ink-faint)" }}>/</span>}
            {it.href ? (
              <Link href={it.href} style={textStyle}>
                {it.label}
              </Link>
            ) : (
              <span style={textStyle}>{it.label}</span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Page header ──────────────────────────────────────────────────

export function RDSHeader({
  left,
  right,
  wordmarkSize = 44,
  wordmarkHref = "/"
}: {
  left?: ReactNode;
  right?: ReactNode;
  wordmarkSize?: number;
  wordmarkHref?: string | null;
}) {
  const mark = <RDSWordmark size={wordmarkSize} />;
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          paddingBottom: 14,
          borderBottom: "1px solid var(--ink)",
          flexWrap: "wrap"
        }}
      >
        {wordmarkHref ? (
          <Link href={wordmarkHref} aria-label="Rival" style={{ display: "inline-flex" }}>
            {mark}
          </Link>
        ) : (
          mark
        )}
        <div style={{ flex: 1, minWidth: 0 }}>{left}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-11)",
            color: "var(--ink-faint)",
            flexWrap: "wrap"
          }}
        >
          {right}
        </div>
      </div>
    </div>
  );
}

// ── Footer ───────────────────────────────────────────────────────

export function RDSFooter() {
  const navLink: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--fs-11)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--ink-mute)",
    textDecoration: "none"
  };
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ height: 1, background: "var(--ink)", marginBottom: 14 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 14,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/matrix" style={navLink}>
            Matrix
          </Link>
          <Link href="/insights" style={navLink}>
            API Insights
          </Link>
        </div>
        <a
          href="https://tabstack.ai"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...navLink, color: "var(--ink-faint)" }}
        >
          Powered by Tabstack
        </a>
      </div>
      <div style={{ height: 1, background: "var(--paper-rule)", marginBottom: 12 }} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-10)",
          color: "var(--ink-faint)",
          letterSpacing: "0.08em",
          flexWrap: "wrap"
        }}
      >
        <span>Rival · open source competitive intelligence</span>
        <a
          href="https://github.com/tessak22/rival"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--ink-faint)" }}
        >
          github.com/tessak22/rival
        </a>
      </div>
    </div>
  );
}

// ── Page shell — wraps every page ────────────────────────────────

export function RDSPageShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--paper-edge)",
        minHeight: "100vh",
        padding: "var(--shell-pad-y) var(--shell-pad-x) var(--s-11)",
        fontFamily: "var(--font-serif)",
        color: "var(--ink)"
      }}
    >
      <div
        style={{
          maxWidth: "var(--page-max)",
          margin: "0 auto",
          background: "var(--paper)",
          padding: "var(--page-pad-y) var(--page-pad-x) var(--s-9)",
          border: "1px solid var(--paper-rule)",
          boxShadow: "var(--shadow-page)"
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Stat block ───────────────────────────────────────────────────

export function RDSStat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-9)",
          letterSpacing: "var(--tr-kicker)",
          color: "var(--ink-faint)",
          textTransform: "uppercase"
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "var(--fs-24)",
          fontWeight: 700,
          letterSpacing: "var(--tr-snug)",
          marginTop: 2,
          color: color ?? "var(--ink)",
          fontFamily: "var(--font-serif)"
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────

export function RDSEmpty({
  title = "Nothing here yet",
  body,
  action
}: {
  title?: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        border: "1px dashed var(--paper-rule-2)",
        background: "color-mix(in srgb, var(--paper) 80%, var(--paper-edge))"
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "var(--fs-20)",
          fontWeight: 700,
          color: "var(--ink)",
          marginBottom: 6
        }}
      >
        {title}
      </div>
      {body && (
        <p
          style={{
            margin: "0 auto",
            maxWidth: 420,
            fontSize: "var(--fs-14)",
            color: "var(--ink-mute)",
            lineHeight: "var(--lh-body)"
          }}
        >
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
