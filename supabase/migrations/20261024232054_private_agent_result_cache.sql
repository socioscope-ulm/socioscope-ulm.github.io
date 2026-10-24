-- Private, disposable computed results. Never expose these tables through the
-- Data API or grant them to browser roles. The API authenticates each request.
CREATE TABLE socioscope.result_cache_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO socioscope.result_cache_state(singleton) VALUES (true);

CREATE TABLE socioscope.result_cache (
 cache_key text PRIMARY KEY CHECK (cache_key ~ '^[0-9a-f]{64}$'),
 revision bigint NOT NULL,
 payload text,
 content_type text,
 expires_at timestamptz NOT NULL DEFAULT now(),
 lease_owner uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(payload IS NULL OR (content_type IS NOT NULL AND octet_length(payload)<=2097152))
);
ALTER TABLE socioscope.result_cache_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE socioscope.result_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON socioscope.result_cache_state,socioscope.result_cache FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON socioscope.result_cache_state,socioscope.result_cache TO service_role;

-- Changes to an input and its cache revision commit together. Even changes
-- made outside the API invalidate results. No business row is rewritten here.
CREATE FUNCTION socioscope.invalidate_agent_results() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,socioscope AS $$
BEGIN
 UPDATE socioscope.result_cache_state SET revision=revision+1 WHERE singleton=true;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION socioscope.invalidate_agent_results() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION socioscope.invalidate_agent_results() TO service_role;

CREATE TRIGGER invalidate_agent_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON socioscope.agent_imports FOR EACH STATEMENT EXECUTE FUNCTION socioscope.invalidate_agent_results();
CREATE TRIGGER invalidate_agent_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON socioscope.agent_decisions FOR EACH STATEMENT EXECUTE FUNCTION socioscope.invalidate_agent_results();
CREATE TRIGGER invalidate_agent_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON socioscope.rup_source_exclusions FOR EACH STATEMENT EXECUTE FUNCTION socioscope.invalidate_agent_results();
CREATE TRIGGER invalidate_agent_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON socioscope.payroll_imports FOR EACH STATEMENT EXECUTE FUNCTION socioscope.invalidate_agent_results();
CREATE TRIGGER invalidate_agent_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON socioscope.prime_settings FOR EACH STATEMENT EXECUTE FUNCTION socioscope.invalidate_agent_results();
CREATE TRIGGER invalidate_agent_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON socioscope.salary_references FOR EACH STATEMENT EXECUTE FUNCTION socioscope.invalidate_agent_results();
CREATE TRIGGER invalidate_agent_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON socioscope.members FOR EACH STATEMENT EXECUTE FUNCTION socioscope.invalidate_agent_results();
