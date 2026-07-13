use anyhow::{Context, Result};
use clap::Parser;
use reqwest::blocking::Client;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::{Path, PathBuf}, thread, time::{Duration, SystemTime, UNIX_EPOCH}};
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(name = "blakfile-sync", about = "Durable BlakFile folder uploader")]
struct Args {
    #[arg(long, env = "BLAKFILE_API_URL", default_value = "http://localhost:3000")]
    api_url: String,
    #[arg(long, env = "BLAKFILE_API_KEY")]
    api_key: String,
    #[arg(long, env = "BLAKFILE_DRIVE_ID")]
    drive_id: String,
    #[arg(long, default_value = ".blakfile-sync.sqlite3")]
    state_db: PathBuf,
    #[arg(long, default_value_t = 15)]
    interval_seconds: u64,
    folder: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateUpload<'a> { drive_id: &'a str, name: &'a str, size_bytes: u64, mime_type: &'a str, checksum_sha256: &'a str }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadSession { upload_session_id: String, object_key: String, upload: SignedUpload }
#[derive(Deserialize)]
struct SignedUpload { url: String, headers: std::collections::HashMap<String, String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompleteUpload<'a> { object_key: &'a str, checksum_sha256: &'a str }

fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64 }
fn init_db(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS uploads (path TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, modified INTEGER NOT NULL, checksum TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_retry INTEGER NOT NULL DEFAULT 0, last_error TEXT, uploaded_checksum TEXT);")?;
    Ok(())
}
fn checksum(path: &Path) -> Result<String> { let mut file = File::open(path)?; let mut hash = Sha256::new(); let mut buf = [0u8; 65536]; loop { let n = file.read(&mut buf)?; if n == 0 { break; } hash.update(&buf[..n]); } Ok(hex::encode(hash.finalize())) }
fn discover(db: &Connection, root: &Path) -> Result<()> {
    for entry in WalkDir::new(root).into_iter().filter_map(Result::ok).filter(|e| e.file_type().is_file()) {
        let meta = entry.metadata()?; let modified = meta.modified()?.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
        let path = entry.path().canonicalize()?.display().to_string(); let size = meta.len() as i64;
        let prior: Option<(i64, i64, Option<String>)> = db.query_row("SELECT size, modified, uploaded_checksum FROM uploads WHERE path = ?1", [&path], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).ok();
        if prior.as_ref().is_some_and(|(old_size, old_modified, uploaded)| *old_size == size && *old_modified == modified && uploaded.is_some()) { continue; }
        let digest = checksum(entry.path())?;
        db.execute("INSERT INTO uploads(path,name,size,modified,checksum,state,next_retry,uploaded_checksum) VALUES(?1,?2,?3,?4,?5,'pending',0,NULL) ON CONFLICT(path) DO UPDATE SET name=excluded.name,size=excluded.size,modified=excluded.modified,checksum=excluded.checksum,state='pending',next_retry=0,uploaded_checksum=NULL", params![path, entry.file_name().to_string_lossy(), size, modified, digest])?;
    } Ok(())
}
fn mime(path: &str) -> &'static str { if path.ends_with(".txt") { "text/plain" } else if path.ends_with(".pdf") { "application/pdf" } else { "application/octet-stream" } }
fn process_one(db: &Connection, client: &Client, args: &Args) -> Result<bool> {
    let row: Option<(String,String,i64,String,i64)> = db.query_row("SELECT path,name,size,checksum,attempts FROM uploads WHERE state='pending' AND next_retry <= ?1 ORDER BY next_retry,path LIMIT 1", [now()], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).ok();
    let Some((path,name,size,digest,attempts)) = row else { return Ok(false) };
    let run = || -> Result<()> {
        let session: UploadSession = client.post(format!("{}/api/v1/uploads", args.api_url.trim_end_matches('/'))).bearer_auth(&args.api_key).json(&CreateUpload { drive_id: &args.drive_id, name: &name, size_bytes: size as u64, mime_type: mime(&name), checksum_sha256: &digest }).send()?.error_for_status()?.json()?;
        let bytes = std::fs::read(&path).with_context(|| format!("read {path}"))?;
        let mut request = client.put(&session.upload.url).body(bytes); for (key, value) in &session.upload.headers { request = request.header(key, value); }
        request.send()?.error_for_status()?;
        client.post(format!("{}/api/v1/uploads/{}/complete", args.api_url.trim_end_matches('/'), session.upload_session_id)).bearer_auth(&args.api_key).json(&CompleteUpload { object_key: &session.object_key, checksum_sha256: &digest }).send()?.error_for_status()?;
        Ok(())
    };
    match run() { Ok(()) => { db.execute("UPDATE uploads SET state='complete',uploaded_checksum=checksum,last_error=NULL WHERE path=?1", [&path])?; eprintln!("uploaded {path}"); }, Err(error) => { let next = now() + (2_i64.pow((attempts as u32).min(6)) * 5); db.execute("UPDATE uploads SET attempts=attempts+1,next_retry=?2,last_error=?3 WHERE path=?1", params![path,next,error.to_string()])?; eprintln!("paused {path}: {error}. Retrying after connectivity returns."); } }
    Ok(true)
}
fn main() -> Result<()> { let args = Args::parse(); let db = Connection::open(&args.state_db)?; init_db(&db)?; let client = Client::builder().timeout(Duration::from_secs(45)).build()?; loop { discover(&db, &args.folder)?; while process_one(&db, &client, &args)? {} thread::sleep(Duration::from_secs(args.interval_seconds)); } }
