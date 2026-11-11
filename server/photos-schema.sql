-- Photos kept in the same private schema and bucket as the individual records.
CREATE TABLE IF NOT EXISTS socioscope.agent_photos (
 id uuid PRIMARY KEY,
 agent_id text,
 detected_name text NOT NULL DEFAULT '',
 source_name text NOT NULL,
 page integer NOT NULL DEFAULT 1,
 object_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_photos_one_per_agent ON socioscope.agent_photos(agent_id) WHERE agent_id IS NOT NULL;
ALTER TABLE socioscope.agent_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON socioscope.agent_photos FROM PUBLIC,anon,authenticated;
