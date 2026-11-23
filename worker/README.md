# Phoenix ONE — Video transcription worker (V2)

**Not deployed.** Runs outside Vercel as a private single-replica container with FFmpeg.

## Runtime requirements
- Docker host with outbound HTTPS access to Supabase Storage/OpenAI and a direct/pooler PostgreSQL connection.
- Inject secrets at runtime using the hosting service's secret manager:
  - `SUPABASE_URL` — existing Phoenix ONE Supabase project URL
  - `SUPABASE_DB_URL` — connection string from Supabase secure settings; **never commit**
  - `SUPABASE_SERVICE_ROLE_KEY` — backend-only secret
  - `OPENAI_API_KEY` — backend-only secret
- Start with one replica to establish load/cost behavior; worker claims DB jobs using `FOR UPDATE SKIP LOCKED`.
- Deploy this image using `docker build -f worker/Dockerfile -t phoenix-one-video-worker .`. Keep the container private; **no HTTP port is exposed**.
- Constrain runtime CPU, memory, disk, concurrency, and outbound credentials; monitor usage before increasing capacity.
- FFmpeg can process untrusted media: run isolated/unprivileged, regularly patch image and cap input size/duration.
- The worker uses service-role privileges and must never run in the browser or public Vercel functions.

## State and cleanup
The user-facing Edge Function `phoenix-hub-large-queue` enqueues validated uploaded objects only; the worker then processes them and stores **text only** in `phoenix_one.large_media_jobs`. Users can read only their jobs through the authenticated function. Text remains review-only until manually imported through Knowledge Hub.
- Staged audio is limited by the existing per-request model size.
- Input bytes are streamed to temporary local disk (bounded by declared size).
- Segment files are deleted after every attempt and the source object is removed after processing.
- Stale leases can be reclaimed three times. Expired, failed and cancelled source files are swept periodically.
- If a worker is offline indefinitely, abandoned temporary source objects are **not automatically cleaned**; configure periodic worker execution before enabling live uploads.

## Release gates
Validate on a non-sensitive test file before enabling any large-video UI. Confirm Storage project-wide 500 MB limit, permissions and TUS upload, actual ffprobe/ffmpeg runtime, transcription billing, cancellation, cleanup, restart/retry, queue visibility, and review flow. Do not expose a user-facing 500 MB feature while the worker is offline.
