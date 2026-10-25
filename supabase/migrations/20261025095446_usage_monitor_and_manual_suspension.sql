-- Application estimates only: never represent these counters as Supabase bills.
CREATE TABLE socioscope.usage_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 suspended boolean NOT NULL DEFAULT false,
 tracking_started timestamptz NOT NULL DEFAULT now(),
 threshold_bytes bigint NOT NULL DEFAULT 4500000000 CHECK(threshold_bytes>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO socioscope.usage_control(singleton) VALUES(true);
CREATE TABLE socioscope.usage_daily (
 day date NOT NULL,
 bucket text NOT NULL CHECK(bucket IN ('storage_cached','storage_uncached','storage_unknown','api')),
 bytes bigint NOT NULL DEFAULT 0 CHECK(bytes>=0),
 requests bigint NOT NULL DEFAULT 0 CHECK(requests>=0),
 unmeasured bigint NOT NULL DEFAULT 0 CHECK(unmeasured>=0 AND unmeasured<=requests),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(day,bucket)
);
ALTER TABLE socioscope.usage_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE socioscope.usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON socioscope.usage_control,socioscope.usage_daily FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON socioscope.usage_control,socioscope.usage_daily TO service_role;
