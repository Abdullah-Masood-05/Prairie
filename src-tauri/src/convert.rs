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
//! .bson / .json / .jsonl import-export, streaming inserts in batches.

use std::io::{Read, Write};
use std::path::Path;

use bson::{doc, Bson, Document};

use crate::client::{BisonConnection, ClientError};

pub const BATCH: usize = 500;

#[derive(Debug, Default, serde::Serialize)]
pub struct ImportSummary {
    pub inserted: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Parses a file into documents. .bson = concatenated BSON documents (each
/// document carries its own leading i32 size); .json = one document or an
/// array; .jsonl = one document per line.
pub fn read_documents(path: &Path) -> Result<Vec<Document>, ClientError> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mut bytes = Vec::new();
    std::fs::File::open(path)?.read_to_end(&mut bytes)?;

    if ext == "bson" {
        let mut docs = Vec::new();
        let mut at = 0usize;
        while at + 4 <= bytes.len() {
            let len = u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
            if len < 5 || at + len > bytes.len() {
                return Err(ClientError::Protocol(format!(
                    "corrupt BSON document at offset {at}"
                )));
            }
            docs.push(bson::from_slice(&bytes[at..at + len])?);
            at += len;
        }
        return Ok(docs);
    }

    let text = String::from_utf8(bytes)
        .map_err(|_| ClientError::Protocol("file is not valid UTF-8".into()))?;
    let mut docs = Vec::new();
    if ext == "jsonl" {
        for (n, line) in text.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            let json: serde_json::Value = serde_json::from_str(line)
                .map_err(|e| ClientError::Protocol(format!("line {}: {e}", n + 1)))?;
            docs.push(json_to_doc(json)?);
        }
    } else {
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| ClientError::Protocol(e.to_string()))?;
        match json {
            serde_json::Value::Array(items) => {
                for item in items {
                    docs.push(json_to_doc(item)?);
                }
            }
            other => docs.push(json_to_doc(other)?),
        }
    }
    Ok(docs)
}

pub fn json_to_doc(json: serde_json::Value) -> Result<Document, ClientError> {
    match Bson::try_from(json) {
        Ok(Bson::Document(d)) => Ok(d),
        Ok(_) => Err(ClientError::Protocol("expected a JSON object".into())),
        Err(e) => Err(ClientError::Protocol(e.to_string())),
    }
}

/// Streams `docs` into the collection in batches, collecting per-batch
/// errors instead of aborting; `progress` is called after every batch.
pub async fn import_documents(
    conn: &mut BisonConnection,
    coll: &str,
    docs: Vec<Document>,
    mut progress: impl FnMut(usize, usize),
) -> Result<ImportSummary, ClientError> {
    let total = docs.len();
    let mut summary = ImportSummary::default();
    for batch in docs.chunks(BATCH) {
        let array: Vec<Bson> = batch.iter().map(|d| Bson::Document(d.clone())).collect();
        match conn
            .command(doc! {"cmd": "insert", "coll": coll, "documents": array})
            .await
        {
            Ok(resp) => {
                summary.inserted += resp.get_i64("insertedCount").unwrap_or(0) as usize;
            }
            Err(ClientError::Server { code, message }) => {
                summary.skipped += batch.len();
                summary.errors.push(format!("[{code}] {message}"));
            }
            Err(e) => return Err(e),
        }
        progress(summary.inserted + summary.skipped, total);
    }
    Ok(summary)
}

/// Renders one BSON value as a CSV cell: scalars plain, ObjectId as hex,
/// everything nested as compact relaxed Extended JSON.
fn csv_cell(value: &Bson) -> String {
    match value {
        Bson::String(s) => s.clone(),
        Bson::Int32(n) => n.to_string(),
        Bson::Int64(n) => n.to_string(),
        Bson::Double(d) => d.to_string(),
        Bson::Boolean(b) => b.to_string(),
        Bson::Null => String::new(),
        Bson::ObjectId(oid) => oid.to_hex(),
        other => other.clone().into_relaxed_extjson().to_string(),
    }
}

/// RFC 4180 quoting: quote cells containing comma/quote/newline, doubling
/// embedded quotes.
fn csv_escape(cell: &str) -> String {
    if cell.contains(',') || cell.contains('"') || cell.contains('\n') || cell.contains('\r') {
        format!("\"{}\"", cell.replace('"', "\"\""))
    } else {
        cell.to_string()
    }
}

fn write_csv(file: &mut std::fs::File, docs: &[Document]) -> Result<(), ClientError> {
    // Header: union of top-level keys in first-appearance order, _id first.
    let mut columns: Vec<String> = Vec::new();
    for d in docs {
        for key in d.keys() {
            if !columns.iter().any(|c| c == key) {
                columns.push(key.clone());
            }
        }
    }
    if let Some(at) = columns.iter().position(|c| c == "_id") {
        let id = columns.remove(at);
        columns.insert(0, id);
    }
    let header: Vec<String> = columns.iter().map(|c| csv_escape(c)).collect();
    writeln!(file, "{}", header.join(","))?;
    for d in docs {
        let row: Vec<String> = columns
            .iter()
            .map(|c| d.get(c).map(csv_cell).unwrap_or_default())
            .map(|cell| csv_escape(&cell))
            .collect();
        writeln!(file, "{}", row.join(","))?;
    }
    Ok(())
}

/// Writes documents in the chosen format: "json" (pretty array), "jsonl"
/// (one relaxed Extended JSON doc per line), "bson" (concatenated), or
/// "csv" (top-level fields as columns, nested values as compact JSON).
pub fn write_documents(path: &Path, docs: &[Document], format: &str) -> Result<(), ClientError> {
    let mut file = std::fs::File::create(path)?;
    match format {
        "csv" => write_csv(&mut file, docs)?,
        "bson" => {
            for d in docs {
                file.write_all(&bson::to_vec(d)?)?;
            }
        }
        "jsonl" => {
            for d in docs {
                let json = Bson::Document(d.clone()).into_relaxed_extjson();
                writeln!(file, "{json}")?;
            }
        }
        "json" => {
            let array: Vec<serde_json::Value> = docs
                .iter()
                .map(|d| Bson::Document(d.clone()).into_relaxed_extjson())
                .collect();
            file.write_all(serde_json::to_string_pretty(&array).unwrap().as_bytes())?;
        }
        other => return Err(ClientError::Other(format!("unknown export format '{other}'"))),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bson_fixture_round_trips() {
        let docs = vec![doc! {"a": 1i32}, doc! {"b": "two", "n": Bson::Null}];
        let dir = std::env::temp_dir().join("prairie_convert_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("fixture.bson");
        write_documents(&path, &docs, "bson").unwrap();
        assert_eq!(read_documents(&path).unwrap(), docs);

        let jsonl = dir.join("fixture.jsonl");
        write_documents(&jsonl, &docs, "jsonl").unwrap();
        assert_eq!(read_documents(&jsonl).unwrap().len(), 2);

        let json = dir.join("fixture.json");
        write_documents(&json, &docs, "json").unwrap();
        assert_eq!(read_documents(&json).unwrap()[0].get_i32("a").unwrap(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn csv_export_quotes_and_orders_columns() {
        let docs = vec![
            doc! {"name": "a,b", "n": 1i32, "_id": bson::oid::ObjectId::parse_str(
                "507f1f77bcf86cd799439011").unwrap()},
            doc! {"name": "say \"hi\"", "extra": {"nested": true}},
        ];
        let dir = std::env::temp_dir().join("prairie_csv_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.csv");
        write_documents(&path, &docs, "csv").unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines[0], "_id,name,n,extra"); // _id first, then appearance order
        assert_eq!(lines[1], "507f1f77bcf86cd799439011,\"a,b\",1,");
        // Nested JSON cells contain quotes, so they get RFC 4180 quoting too.
        assert_eq!(lines[2], ",\"say \"\"hi\"\"\",,\"{\"\"nested\"\":true}\"");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_bson_is_rejected() {
        let dir = std::env::temp_dir().join("prairie_convert_bad");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("bad.bson");
        std::fs::write(&path, [0xFFu8, 0xFF, 0xFF, 0x7F, 0x00]).unwrap();
        assert!(read_documents(&path).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
