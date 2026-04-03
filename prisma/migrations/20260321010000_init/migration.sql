CREATE TABLE "competitors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "manual_data" JSONB,
    "manual_last_updated" TIMESTAMPTZ,
    "threat_level" TEXT,
    "intelligence_brief" JSONB,
    "brief_generated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competitor_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competitor_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "geo_target" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "competitor_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "endpoint_used" TEXT NOT NULL,
    "raw_result" JSONB,
    "markdown_result" TEXT,
    "summary" TEXT,
    "has_changes" BOOLEAN NOT NULL DEFAULT FALSE,
    "diff_summary" TEXT,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deep_dives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competitor_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "result" JSONB,
    "citations" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "deep_dives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competitor_id" UUID,
    "page_id" UUID,
    "called_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "endpoint" TEXT NOT NULL,
    "url" TEXT,
    "effort" TEXT,
    "nocache" BOOLEAN,
    "geo_target" TEXT,
    "mode" TEXT,
    "status" TEXT NOT NULL,
    "fallback_triggered" BOOLEAN NOT NULL DEFAULT FALSE,
    "fallback_reason" TEXT,
    "fallback_endpoint" TEXT,
    "result_quality" TEXT,
    "missing_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "page_not_found" BOOLEAN NOT NULL DEFAULT FALSE,
    "content_blocked" BOOLEAN NOT NULL DEFAULT FALSE,
    "schema_mismatch" BOOLEAN NOT NULL DEFAULT FALSE,
    "raw_error" TEXT,
    "duration_ms" INTEGER,
    "is_demo" BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competitor_id" UUID NOT NULL,
    "scan_id" UUID,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "payload" JSONB,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demo_scans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ip_hash" TEXT NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "demo_scans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competitors_slug_key" ON "competitors"("slug");

CREATE INDEX "competitor_pages_competitor_id_idx" ON "competitor_pages"("competitor_id");
CREATE INDEX "competitor_pages_competitor_id_type_idx" ON "competitor_pages"("competitor_id", "type");

CREATE INDEX "scans_page_id_idx" ON "scans"("page_id");
CREATE INDEX "scans_scanned_at_idx" ON "scans"("scanned_at");

CREATE INDEX "deep_dives_competitor_id_idx" ON "deep_dives"("competitor_id");
CREATE INDEX "deep_dives_created_at_idx" ON "deep_dives"("created_at");

CREATE INDEX "api_logs_competitor_id_idx" ON "api_logs"("competitor_id");
CREATE INDEX "api_logs_page_id_idx" ON "api_logs"("page_id");
CREATE INDEX "api_logs_called_at_idx" ON "api_logs"("called_at");
CREATE INDEX "api_logs_endpoint_idx" ON "api_logs"("endpoint");
CREATE INDEX "api_logs_status_idx" ON "api_logs"("status");

CREATE INDEX "notifications_competitor_id_idx" ON "notifications"("competitor_id");
CREATE INDEX "notifications_scan_id_idx" ON "notifications"("scan_id");
CREATE INDEX "notifications_sent_at_idx" ON "notifications"("sent_at");

CREATE INDEX "demo_scans_ip_hash_idx" ON "demo_scans"("ip_hash");
CREATE INDEX "demo_scans_ip_hash_scanned_at_idx" ON "demo_scans"("ip_hash", "scanned_at");

ALTER TABLE "competitor_pages"
ADD CONSTRAINT "competitor_pages_competitor_id_fkey"
FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scans"
ADD CONSTRAINT "scans_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "competitor_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deep_dives"
ADD CONSTRAINT "deep_dives_competitor_id_fkey"
FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_logs"
ADD CONSTRAINT "api_logs_competitor_id_fkey"
FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "api_logs"
ADD CONSTRAINT "api_logs_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "competitor_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_competitor_id_fkey"
FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_scan_id_fkey"
FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
