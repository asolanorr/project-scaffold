-- Supabase Storage: the `uploads` bucket and its Row Level Security policies.
--
-- Guarded: the `storage` schema exists only on Supabase. Local Postgres and
-- the CI service container have no Storage, and this migration must not fail
-- there — it does nothing where there is nothing to configure.
--
-- Object keys are `{userId}/{fileId}{ext}`, so the first path segment is the
-- owner. The policies grant the `authenticated` role access to its own prefix
-- and nothing else; `storage.objects` already has RLS enabled on Supabase, so
-- with no other policies every other path is closed. The application itself
-- never hits these: it uploads through signed URLs minted with the service
-- role, which bypasses RLS. The policies are the backstop for any Supabase
-- client that ever holds a user JWT (ADR 006).
--
-- The bucket is private, capped at 10 MiB per object, and limited to the
-- types the application accepts — enforced by Storage on the upload itself,
-- independently of the application's own checks.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'uploads',
      'uploads',
      false,
      10485760,
      ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE
      SET public = EXCLUDED.public,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;

    DROP POLICY IF EXISTS "uploads: owner reads own prefix" ON storage.objects;
    CREATE POLICY "uploads: owner reads own prefix" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

    DROP POLICY IF EXISTS "uploads: owner writes own prefix" ON storage.objects;
    CREATE POLICY "uploads: owner writes own prefix" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

    DROP POLICY IF EXISTS "uploads: owner updates own prefix" ON storage.objects;
    CREATE POLICY "uploads: owner updates own prefix" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

    DROP POLICY IF EXISTS "uploads: owner deletes own prefix" ON storage.objects;
    CREATE POLICY "uploads: owner deletes own prefix" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END
$$;
