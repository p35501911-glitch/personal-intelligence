-- =====================================================================
-- Phase 4B: System Job Runs & Distributed Job Lock Infrastructure
-- =====================================================================

-- 1. System Job Execution Telemetry Table
CREATE TABLE IF NOT EXISTS system_job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient telemetry queries and health monitoring
CREATE INDEX IF NOT EXISTS idx_system_job_runs_job_name ON system_job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_system_job_runs_status ON system_job_runs(status);
CREATE INDEX IF NOT EXISTS idx_system_job_runs_created_at ON system_job_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_job_runs_lookup ON system_job_runs(job_name, status, created_at DESC);

-- 2. Distributed Job Locks Table
CREATE TABLE IF NOT EXISTS system_job_locks (
    job_name TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_job_locks_expires_at ON system_job_locks(expires_at);

-- 3. Row Level Security Hardening
ALTER TABLE system_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_job_locks ENABLE ROW LEVEL SECURITY;

-- Allow full access to service_role strictly for backend workers and cron jobs
CREATE POLICY "Service role full access on system_job_runs"
    ON system_job_runs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on system_job_locks"
    ON system_job_locks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Explicitly deny public read access to prevent exposing internal job metadata
-- (Default RLS deny applies to anon and authenticated roles)
