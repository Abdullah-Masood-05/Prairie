/*
 * Prairie - a desktop GUI client for BisonDB
 * Copyright (C) 2026 Abdullah Masood
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
//! BisonDB wire-protocol client: 4-byte LE length prefix + one BSON document
//! per frame, strictly sequential request/response (see docs/protocol.md).
//!
//! The transport is either plain TCP or TLS (rustls); above it the framing,
//! the authentication handshake, and command dispatch are identical.

use std::collections::HashMap;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Once};
use std::task::{Context, Poll};
use std::time::Duration;

use bson::{doc, Bson, Document};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{RootCertStore, SignatureScheme};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_rustls::TlsConnector;

pub const MAX_MESSAGE: u32 = 16 * 1024 * 1024;
pub const MIN_MESSAGE: u32 = 5;
/// Hard client-side cap on reassembled find() results, to protect the UI.
pub const FIND_HARD_CAP: usize = 10_000;
/// Session-token lifetime hint; the server is the source of truth.
const RECONNECT_RETRY: usize = 1;

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("E[{code}] {message}")]
    Server { code: String, message: String },
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("TLS error: {0}")]
    Tls(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Bson(#[from] bson::ser::Error),
    #[error(transparent)]
    BsonDe(#[from] bson::de::Error),
    #[error("{0}")]
    Other(String),
}

// ── transport: plain TCP or TLS, behind one AsyncRead/AsyncWrite type ────────

enum Transport {
    Plain(TcpStream),
    Tls(Box<tokio_rustls::client::TlsStream<TcpStream>>),
}

impl AsyncRead for Transport {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Transport::Plain(s) => Pin::new(s).poll_read(cx, buf),
            Transport::Tls(s) => Pin::new(s).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for Transport {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match self.get_mut() {
            Transport::Plain(s) => Pin::new(s).poll_write(cx, buf),
            Transport::Tls(s) => Pin::new(s).poll_write(cx, buf),
        }
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Transport::Plain(s) => Pin::new(s).poll_flush(cx),
            Transport::Tls(s) => Pin::new(s).poll_flush(cx),
        }
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Transport::Plain(s) => Pin::new(s).poll_shutdown(cx),
            Transport::Tls(s) => Pin::new(s).poll_shutdown(cx),
        }
    }
}

// ── TLS verification policy (mirrors the server's client options) ────────────

#[derive(Clone, Debug)]
pub enum TlsMode {
    System,         // OS trust store + hostname
    CaFile(String), // trust a specific CA/self-signed PEM + hostname
    Pin(String),    // accept exactly the cert with this SHA-256 (hex)
    Insecure,       // skip verification (caller must warn)
}

#[derive(Clone, Debug)]
pub struct TlsConfig {
    pub mode: TlsMode,
    pub hostname: String, // SNI + verification target
}

/// Reported transport security of a live connection.
#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TlsState {
    Plaintext,
    Verified,
    Unverified,
}

fn ensure_crypto_provider() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    });
}

fn normalize_fingerprint(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c, ':' | ' ' | '\t' | '\n' | '\r'))
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Accepts the leaf certificate iff its SHA-256 fingerprint matches the pin.
#[derive(Debug)]
struct PinVerifier {
    fingerprint: String,
}
impl ServerCertVerifier for PinVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let got = sha256_hex(end_entity.as_ref());
        if got == self.fingerprint {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General(format!(
                "certificate fingerprint {got} does not match the pinned value"
            )))
        }
    }
    fn verify_tls12_signature(
        &self,
        _m: &[u8],
        _c: &CertificateDer<'_>,
        _d: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn verify_tls13_signature(
        &self,
        _m: &[u8],
        _c: &CertificateDer<'_>,
        _d: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::aws_lc_rs::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Accepts ANY certificate. Used only for the explicit insecure opt-out.
#[derive(Debug)]
struct InsecureVerifier;
impl ServerCertVerifier for InsecureVerifier {
    fn verify_server_cert(
        &self,
        _e: &CertificateDer<'_>,
        _i: &[CertificateDer<'_>],
        _n: &ServerName<'_>,
        _o: &[u8],
        _t: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        _m: &[u8],
        _c: &CertificateDer<'_>,
        _d: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn verify_tls13_signature(
        &self,
        _m: &[u8],
        _c: &CertificateDer<'_>,
        _d: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::aws_lc_rs::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

fn system_roots() -> RootCertStore {
    let mut store = RootCertStore::empty();
    let result = rustls_native_certs::load_native_certs();
    for cert in result.certs {
        let _ = store.add(cert);
    }
    if store.is_empty() {
        store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    }
    store
}

fn roots_from_pem(path: &str) -> Result<RootCertStore, ClientError> {
    let pem = std::fs::read(path)
        .map_err(|e| ClientError::Tls(format!("cannot read CA file {path}: {e}")))?;
    let mut reader = std::io::BufReader::new(&pem[..]);
    let mut store = RootCertStore::empty();
    let mut added = 0;
    for cert in rustls_pemfile::certs(&mut reader) {
        let cert = cert.map_err(|e| ClientError::Tls(format!("bad CA PEM: {e}")))?;
        store
            .add(cert)
            .map_err(|e| ClientError::Tls(format!("bad CA cert: {e}")))?;
        added += 1;
    }
    if added == 0 {
        return Err(ClientError::Tls(format!("no certificates found in {path}")));
    }
    Ok(store)
}

fn build_connector(cfg: &TlsConfig) -> Result<TlsConnector, ClientError> {
    ensure_crypto_provider();
    let config = match &cfg.mode {
        TlsMode::System => rustls::ClientConfig::builder()
            .with_root_certificates(system_roots())
            .with_no_client_auth(),
        TlsMode::CaFile(path) => rustls::ClientConfig::builder()
            .with_root_certificates(roots_from_pem(path)?)
            .with_no_client_auth(),
        TlsMode::Pin(fp) => rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(PinVerifier {
                fingerprint: normalize_fingerprint(fp),
            }))
            .with_no_client_auth(),
        TlsMode::Insecure => rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(InsecureVerifier))
            .with_no_client_auth(),
    };
    Ok(TlsConnector::from(Arc::new(config)))
}

// ── connection ───────────────────────────────────────────────────────────────

pub struct BisonConnection {
    stream: Transport,
    pub host: String,
    pub port: u16,
    pub tls: TlsState,
    pub peer_fingerprint: Option<String>,
    // Auth state. The token and password live ONLY here in the Rust backend;
    // the frontend never sees them (it holds an opaque connection id).
    pub username: Option<String>,
    password: Option<String>,
    token: Option<String>,
    pub roles: Vec<String>,
}

impl BisonConnection {
    /// Connects (TCP, then TLS when `tls` is provided). Does NOT authenticate.
    pub async fn connect(
        host: &str,
        port: u16,
        timeout: Duration,
        tls: Option<TlsConfig>,
    ) -> Result<Self, ClientError> {
        let tcp = tokio::time::timeout(timeout, TcpStream::connect((host, port)))
            .await
            .map_err(|_| ClientError::Protocol(format!("connect to {host}:{port} timed out")))??;
        tcp.set_nodelay(true)?;

        let (stream, state, fingerprint) = match tls {
            None => (Transport::Plain(tcp), TlsState::Plaintext, None),
            Some(cfg) => {
                let connector = build_connector(&cfg)?;
                let server_name = ServerName::try_from(cfg.hostname.clone())
                    .map_err(|_| ClientError::Tls(format!("invalid hostname '{}'", cfg.hostname)))?
                    .to_owned();
                let tls_stream = connector.connect(server_name, tcp).await.map_err(|e| {
                    ClientError::Tls(format!(
                        "TLS handshake failed: {e} — is the server using TLS? \
                         If it is plaintext, turn off 'Use TLS'."
                    ))
                })?;
                let fp = tls_stream
                    .get_ref()
                    .1
                    .peer_certificates()
                    .and_then(|c| c.first())
                    .map(|c| sha256_hex(c.as_ref()));
                let state = match cfg.mode {
                    TlsMode::Insecure => TlsState::Unverified,
                    _ => TlsState::Verified,
                };
                (Transport::Tls(Box::new(tls_stream)), state, fp)
            }
        };

        Ok(Self {
            stream,
            host: host.to_string(),
            port,
            tls: state,
            peer_fingerprint: fingerprint,
            username: None,
            password: None,
            token: None,
            roles: Vec::new(),
        })
    }

    /// One request/response exchange, no auto-reauth.
    async fn command_raw(&mut self, request: Document) -> Result<Document, ClientError> {
        let payload = bson::to_vec(&request)?;
        if payload.len() > MAX_MESSAGE as usize {
            return Err(ClientError::Protocol("request exceeds 16 MiB".into()));
        }
        self.stream
            .write_all(&(payload.len() as u32).to_le_bytes())
            .await?;
        self.stream.write_all(&payload).await?;

        let mut len_bytes = [0u8; 4];
        self.stream.read_exact(&mut len_bytes).await?;
        let len = u32::from_le_bytes(len_bytes);
        if !(MIN_MESSAGE..=MAX_MESSAGE).contains(&len) {
            return Err(ClientError::Protocol(format!(
                "response frame length {len} outside [{MIN_MESSAGE}, {MAX_MESSAGE}]"
            )));
        }
        let mut payload = vec![0u8; len as usize];
        self.stream.read_exact(&mut payload).await?;
        let response: Document = bson::from_slice(&payload)?;

        if response.get_bool("ok").unwrap_or(false) {
            return Ok(response);
        }
        let (code, message) = match response.get_document("error") {
            Ok(err) => (
                err.get_str("code").unwrap_or("Internal").to_string(),
                err.get_str("message")
                    .unwrap_or("unknown error")
                    .to_string(),
            ),
            Err(_) => ("Internal".into(), "malformed error response".into()),
        };
        Err(ClientError::Server { code, message })
    }

    /// Like `command_raw`, but on `TokenExpired` it transparently
    /// re-authenticates with the stored password (if any) and retries once.
    pub async fn command(&mut self, request: Document) -> Result<Document, ClientError> {
        match self.command_raw(request.clone()).await {
            Err(ClientError::Server { code, .. }) if code == "TokenExpired" => {
                let creds = self.username.clone().zip(self.password.clone());
                match creds {
                    Some((u, p)) => {
                        for _ in 0..RECONNECT_RETRY {
                            let resp = self
                                .command_raw(
                                    doc! {"cmd": "authenticate", "username": &u, "password": &p},
                                )
                                .await?;
                            self.token = resp.get_str("token").ok().map(String::from);
                            return self.command_raw(request).await;
                        }
                        unreachable!()
                    }
                    None => Err(ClientError::Server {
                        code: "TokenExpired".into(),
                        message: "session expired; please log in again".into(),
                    }),
                }
            }
            other => other,
        }
    }

    // ── auth ──────────────────────────────────────────────────────────────
    pub fn authenticated(&self) -> bool {
        self.token.is_some()
    }

    pub async fn authenticate(
        &mut self,
        username: &str,
        password: &str,
    ) -> Result<(), ClientError> {
        let resp = self
            .command_raw(doc! {"cmd": "authenticate", "username": username, "password": password})
            .await?;
        self.token = resp.get_str("token").ok().map(String::from);
        self.username = Some(username.to_string());
        self.password = Some(password.to_string());
        self.roles = read_roles(&resp);
        Ok(())
    }

    pub async fn bootstrap_admin(
        &mut self,
        bootstrap_token: &str,
        username: &str,
        password: &str,
    ) -> Result<(), ClientError> {
        let resp = self
            .command_raw(doc! {
                "cmd": "createUser",
                "bootstrapToken": bootstrap_token,
                "username": username,
                "password": password,
                "roles": ["admin"],
            })
            .await?;
        self.token = resp.get_str("token").ok().map(String::from);
        self.username = Some(username.to_string());
        self.password = Some(password.to_string());
        self.roles = read_roles(&resp);
        Ok(())
    }

    pub async fn logout(&mut self) {
        let _ = self.command_raw(doc! {"cmd": "logout"}).await;
        self.token = None;
        self.password = None;
        self.username = None;
        self.roles.clear();
    }

    /// find that transparently follows truncated responses (skipNext).
    pub async fn find(
        &mut self,
        coll: &str,
        filter: Document,
        limit: usize,
        skip: usize,
    ) -> Result<Vec<Document>, ClientError> {
        let mut out: Vec<Document> = Vec::new();
        let mut skip = skip as i64;
        loop {
            let mut req = doc! { "cmd": "find", "coll": coll, "filter": filter.clone() };
            if limit != 0 {
                req.insert("limit", (limit - out.len()) as i64);
            }
            req.insert("skip", skip);
            let resp = self.command(req).await?;
            if let Ok(docs) = resp.get_array("documents") {
                for d in docs {
                    if let Bson::Document(d) = d {
                        out.push(d.clone());
                    }
                }
            }
            let truncated = resp.get_bool("truncated").unwrap_or(false);
            if !truncated || (limit != 0 && out.len() >= limit) || out.len() >= FIND_HARD_CAP {
                return Ok(out);
            }
            skip = resp
                .get_i64("skipNext")
                .map_err(|_| ClientError::Protocol("truncated response without skipNext".into()))?;
        }
    }
}

fn read_roles(resp: &Document) -> Vec<String> {
    resp.get_array("roles")
        .map(|a| {
            a.iter()
                .filter_map(|b| b.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Registry of live connections held in tauri State. The per-connection
/// tokio Mutex enforces one in-flight request (the protocol is sequential).
pub struct ConnectionManager {
    next_id: AtomicU64,
    pub connections: Mutex<HashMap<u64, std::sync::Arc<Mutex<BisonConnection>>>>,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            connections: Mutex::new(HashMap::new()),
        }
    }
}

impl ConnectionManager {
    pub async fn register(&self, conn: BisonConnection) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.connections
            .lock()
            .await
            .insert(id, std::sync::Arc::new(Mutex::new(conn)));
        id
    }

    pub async fn get(
        &self,
        id: u64,
    ) -> Result<std::sync::Arc<Mutex<BisonConnection>>, ClientError> {
        self.connections
            .lock()
            .await
            .get(&id)
            .cloned()
            .ok_or_else(|| ClientError::Other(format!("no connection with id {id}")))
    }

    pub async fn remove(&self, id: u64) {
        self.connections.lock().await.remove(&id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    async fn mock_server(replies: Vec<Document>) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            for reply in replies {
                let mut len = [0u8; 4];
                sock.read_exact(&mut len).await.unwrap();
                let mut buf = vec![0u8; u32::from_le_bytes(len) as usize];
                sock.read_exact(&mut buf).await.unwrap();
                let payload = bson::to_vec(&reply).unwrap();
                let frame = [&(payload.len() as u32).to_le_bytes()[..], &payload[..]].concat();
                for chunk in frame.chunks(3) {
                    sock.write_all(chunk).await.unwrap();
                    sock.flush().await.unwrap();
                }
            }
        });
        port
    }

    #[tokio::test]
    async fn framing_round_trip() {
        let port = mock_server(vec![doc! {"ok": true, "answer": 42i32}]).await;
        let mut conn = BisonConnection::connect("127.0.0.1", port, Duration::from_secs(2), None)
            .await
            .unwrap();
        let resp = conn.command(doc! {"cmd": "ping"}).await.unwrap();
        assert_eq!(resp.get_i32("answer").unwrap(), 42);
    }

    #[tokio::test]
    async fn server_errors_become_typed() {
        let port = mock_server(vec![
            doc! {"ok": false, "error": {"code": "DuplicateKey", "message": "nope"}},
        ])
        .await;
        let mut conn = BisonConnection::connect("127.0.0.1", port, Duration::from_secs(2), None)
            .await
            .unwrap();
        match conn.command(doc! {"cmd": "x"}).await {
            Err(ClientError::Server { code, .. }) => assert_eq!(code, "DuplicateKey"),
            other => panic!("expected ServerError, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn truncated_find_is_reassembled() {
        let port = mock_server(vec![
            doc! {"ok": true, "documents": [{"i": 1}, {"i": 2}], "count": 2i64,
            "truncated": true, "skipNext": 2i64},
            doc! {"ok": true, "documents": [{"i": 3}], "count": 1i64},
        ])
        .await;
        let mut conn = BisonConnection::connect("127.0.0.1", port, Duration::from_secs(2), None)
            .await
            .unwrap();
        let docs = conn.find("c", doc! {}, 0, 0).await.unwrap();
        assert_eq!(docs.len(), 3);
        assert_eq!(docs[2].get_i32("i").unwrap(), 3);
    }

    #[tokio::test]
    async fn token_expired_without_password_surfaces() {
        let port = mock_server(vec![
            doc! {"ok": false, "error": {"code": "TokenExpired", "message": "expired"}},
        ])
        .await;
        let mut conn = BisonConnection::connect("127.0.0.1", port, Duration::from_secs(2), None)
            .await
            .unwrap();
        match conn.command(doc! {"cmd": "find"}).await {
            Err(ClientError::Server { code, .. }) => assert_eq!(code, "TokenExpired"),
            other => panic!("expected TokenExpired, got {other:?}"),
        }
    }
}
