-- LOCAL ONLY, executed by the dedicated NOLOGIN schema owner.
-- Auth emulation for synthetic fixtures; not GoTrue/JWT validation.
CREATE TABLE auth.users (
 id uuid PRIMARY KEY, aud text, role text, email text,
 encrypted_password text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
 created_at timestamptz, updated_at timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role,fintrack_tester;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role,fintrack_tester;
GRANT USAGE ON SCHEMA public,extensions TO authenticated,anon,service_role,fintrack_tester;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO authenticated;
