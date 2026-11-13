-- One active, private organigram/trombinoscope document per agency.
-- Only authenticated sessions can reach it through the secured Edge Function.
CREATE TABLE IF NOT EXISTS socioscope.trombinoscope_documents (
 agency text PRIMARY KEY CHECK (agency IN ('AMTNO','AMTE','AMTVDR','AMTC','AMTO','AMTSO','ALN','ULM')),
 filename text NOT NULL,
 period text,
 object_key text NOT NULL UNIQUE,
 size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE socioscope.trombinoscope_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE socioscope.trombinoscope_documents FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE socioscope.trombinoscope_documents IS 'Trombinoscopes PDF proteges, un document actif par agence; acces via Edge Function apres verification du compte.';
