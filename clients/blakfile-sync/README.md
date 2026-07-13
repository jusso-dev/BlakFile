# BlakFile Sync

`blakfile-sync` is a small single-binary folder uploader for BlakFile. It keeps
a durable SQLite queue beside the chosen folder, hashes changed files, uploads
through the existing secure upload-session API, and retries pending work with
exponential backoff after an API or object-store outage. Pending work survives
process restarts and resumes automatically once connectivity returns.

```bash
cargo build --release --manifest-path clients/blakfile-sync/Cargo.toml
BLAKFILE_API_KEY=bf_live_... BLAKFILE_DRIVE_ID=<drive-id> \
  clients/blakfile-sync/target/release/blakfile-sync ~/Documents
```

This first client intentionally uses the existing single-part upload API. A
network failure before a PUT completes retries the file through a fresh signed
session; byte-range multipart continuation is tracked separately as a future
server/API capability.
