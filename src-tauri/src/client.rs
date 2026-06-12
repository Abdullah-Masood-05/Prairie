//! BisonDB wire-protocol client: 4-byte LE length prefix + one BSON document
//! per frame, strictly sequential request/response (see docs/protocol.md).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use bson::{doc, Bson, Document};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

pub const MAX_MESSAGE: u32 = 16 * 1024 * 1024;
pub const MIN_MESSAGE: u32 = 5;
/// Hard client-side cap on reassembled find() results, to protect the UI.
pub const FIND_HARD_CAP: usize = 10_000;

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("E[{code}] {message}")]
    Server { code: String, message: String },
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Bson(#[from] bson::ser::Error),
    #[error(transparent)]
    BsonDe(#[from] bson::de::Error),
    #[error("{0}")]
    Other(String),
}

pub struct BisonConnection {
    stream: TcpStream,
    pub host: String,
    pub port: u16,
}

impl BisonConnection {
    pub async fn connect(host: &str, port: u16, timeout: Duration) -> Result<Self, ClientError> {
        let stream = tokio::time::timeout(timeout, TcpStream::connect((host, port)))
            .await
            .map_err(|_| ClientError::Protocol(format!("connect to {host}:{port} timed out")))??;
        stream.set_nodelay(true)?;
        Ok(Self { stream, host: host.to_string(), port })
    }

    /// Sends one request document and returns the `ok: true` response.
    /// `{ ok: false, error }` responses surface as `ClientError::Server`.
    pub async fn command(&mut self, request: Document) -> Result<Document, ClientError> {
        let payload = bson::to_vec(&request)?;
        if payload.len() > MAX_MESSAGE as usize {
            return Err(ClientError::Protocol("request exceeds 16 MiB".into()));
        }
        self.stream.write_all(&(payload.len() as u32).to_le_bytes()).await?;
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
                err.get_str("message").unwrap_or("unknown error").to_string(),
            ),
            Err(_) => ("Internal".into(), "malformed error response".into()),
        };
        Err(ClientError::Server { code, message })
    }

    /// find that transparently follows truncated responses (skipNext) until
    /// the server stops truncating, the requested limit is reached, or the
    /// hard cap trips.
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
            if !truncated
                || (limit != 0 && out.len() >= limit)
                || out.len() >= FIND_HARD_CAP
            {
                return Ok(out);
            }
            skip = resp.get_i64("skipNext").map_err(|_| {
                ClientError::Protocol("truncated response without skipNext".into())
            })?;
        }
    }
}

/// Registry of live connections held in tauri State. The per-connection
/// tokio Mutex enforces one in-flight request (the protocol is sequential).
pub struct ConnectionManager {
    next_id: AtomicU64,
    pub connections: Mutex<HashMap<u64, std::sync::Arc<Mutex<BisonConnection>>>>,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self { next_id: AtomicU64::new(1), connections: Mutex::new(HashMap::new()) }
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

    /// Mock server: replies to every frame with a canned document, sent in
    /// deliberately tiny chunks to prove framing survives TCP boundaries.
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
                let frame =
                    [&(payload.len() as u32).to_le_bytes()[..], &payload[..]].concat();
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
        let mut conn =
            BisonConnection::connect("127.0.0.1", port, Duration::from_secs(2)).await.unwrap();
        let resp = conn.command(doc! {"cmd": "ping"}).await.unwrap();
        assert_eq!(resp.get_i32("answer").unwrap(), 42);
    }

    #[tokio::test]
    async fn server_errors_become_typed() {
        let port = mock_server(vec![
            doc! {"ok": false, "error": {"code": "DuplicateKey", "message": "nope"}},
        ])
        .await;
        let mut conn =
            BisonConnection::connect("127.0.0.1", port, Duration::from_secs(2)).await.unwrap();
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
        let mut conn =
            BisonConnection::connect("127.0.0.1", port, Duration::from_secs(2)).await.unwrap();
        let docs = conn.find("c", doc! {}, 0, 0).await.unwrap();
        assert_eq!(docs.len(), 3);
        assert_eq!(docs[2].get_i32("i").unwrap(), 3);
    }
}
