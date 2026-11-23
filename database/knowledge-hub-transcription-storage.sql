-- Phoenix ONE — transcrição temporária de áudio/vídeo.
-- Bucket privado, upload/download/delete por usuário Phoenix ONE autorizado.
-- Aplicar de forma transacional antes do deploy frontend/backend.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE SCHEMA IF NOT EXISTS phoenix_hub_access;
REVOKE ALL ON SCHEMA phoenix_hub_access FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA phoenix_hub_access TO authenticated;
CREATE OR REPLACE FUNCTION phoenix_hub_access.phoenix_hub_transcription_editor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM phoenix_one.admin_users p
  WHERE p.user_id=(SELECT auth.uid()) AND p.role IN ('owner','admin','editor')
 );
$fn$;
REVOKE ALL ON FUNCTION phoenix_hub_access.phoenix_hub_transcription_editor() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION phoenix_hub_access.phoenix_hub_transcription_editor() TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('phoenix-hub-transcription-temp','phoenix-hub-transcription-temp',false,24000000,
 ARRAY['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','video/mp4','video/mpeg',
       'audio/wav','audio/x-wav','audio/webm','video/webm','audio/ogg',
       'application/ogg','audio/flac','audio/x-flac','application/octet-stream']::text[])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "phoenix_hub_transcription_upload"
 ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (
  bucket_id='phoenix-hub-transcription-temp'
  AND (SELECT phoenix_hub_access.phoenix_hub_transcription_editor())
  AND split_part(name,'/',1)=(SELECT auth.uid())::text
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](mp3|mpga|mpeg|m4a|mp4|wav|ogg|webm|flac)$'
 );
CREATE POLICY "phoenix_hub_transcription_read"
 ON storage.objects FOR SELECT TO authenticated
 USING (
  bucket_id='phoenix-hub-transcription-temp'
  AND (SELECT phoenix_hub_access.phoenix_hub_transcription_editor())
  AND split_part(name,'/',1)=(SELECT auth.uid())::text
 );
CREATE POLICY "phoenix_hub_transcription_delete"
 ON storage.objects FOR DELETE TO authenticated
 USING (
  bucket_id='phoenix-hub-transcription-temp'
  AND (SELECT phoenix_hub_access.phoenix_hub_transcription_editor())
  AND split_part(name,'/',1)=(SELECT auth.uid())::text
 );
COMMIT;
