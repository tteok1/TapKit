#![allow(unsafe_op_in_unsafe_fn)]
mod office;
mod recovery;
mod sandbox;
mod win;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::sync::mpsc;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub protocol_version: u32,
    pub request_id: String,
    pub run_id: String,
    pub lease_epoch: u64,
    pub operation: String,
    pub payload: Payload,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Payload {
    pub runtime_root: String,
    pub executable: String,
    pub input_root: String,
    pub workspace: String,
    pub args: Vec<String>,
    pub timeout_ms: u64,
    pub memory_bytes: usize,
    pub process_limit: u32,
    pub output_bytes: usize,
    pub terminal: bool,
    #[serde(default)]
    pub office: Option<office::OfficeRequest>,
}
pub fn emit(r: &Request, event: &str, data: Value) {
    println!(
        "{}",
        json!({"protocolVersion":1,"requestId":r.request_id,"runId":r.run_id,
        "leaseEpoch":r.lease_epoch,"event":event,"data":data})
    );
    let _ = io::stdout().flush();
}
fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.chars().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
        && id.as_bytes()[14] == b'7'
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        let result = unsafe {
            match (args[1].as_str(), args.get(2)) {
                ("--identity", None) => win::self_token().and_then(|t| {
                    Ok(json!({"sid":win::user_sid(t.0)?,"elevated":win::elevated()?}))
                }),
                _ => Err("CLI_VALIDATION_ERROR".into()),
            }
        };
        match result {
            Ok(value) => println!("{value}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut input = io::stdin().lock();
        loop {
            let mut bytes = Vec::new();
            // read_until alone would allocate without bound on a hostile protocol input.
            let mut reader = (&mut input).take(65_537);
            use std::io::Read;
            match reader.read_until(b'\n', &mut bytes) {
                Ok(0) | Err(_) => break,
                Ok(_) if bytes.len() > 65_536 => break,
                Ok(_) => {
                    if tx.send(bytes).is_err() {
                        break;
                    }
                }
            }
        }
    });
    let result = rx
        .recv()
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Request>(&bytes).ok());
    let Some(r) = result else {
        eprintln!("VALIDATION_ERROR");
        std::process::exit(2);
    };
    if r.protocol_version != 1
        || !valid_id(&r.request_id)
        || !valid_id(&r.run_id)
        || r.lease_epoch == 0
        || r.lease_epoch > 9_007_199_254_740_991
        || !["diagnostic.execute", "office.render"].contains(&r.operation.as_str())
        || (r.operation == "diagnostic.execute" && r.payload.office.is_some())
        || (r.operation == "office.render"
            && (r.payload.office.is_none() || !r.payload.args.is_empty() || r.payload.terminal))
        || r.payload.args.len() > 32
        || r.payload
            .args
            .iter()
            .any(|a| a.contains('\0') || a.len() > 8192)
        || !(50..=120000).contains(&r.payload.timeout_ms)
        || !(64 * 1024 * 1024..=2 * 1024 * 1024 * 1024).contains(&r.payload.memory_bytes)
        || !(1..=32).contains(&r.payload.process_limit)
        || !(1024..=4 * 1024 * 1024).contains(&r.payload.output_bytes)
    {
        emit(
            &r,
            "failed",
            json!({"code":"VALIDATION_ERROR","stage":"protocol"}),
        );
        std::process::exit(2);
    }
    match unsafe {
        recovery::recover_stale()
            .and_then(|_| office::recover_stale())
            .and_then(|_| {
                if r.operation == "office.render" {
                    office::execute(&r, &rx)
                } else {
                    sandbox::execute(&r, &rx)
                }
            })
    } {
        Ok(data) => emit(&r, "finished", data),
        Err(error) => {
            emit(
                &r,
                "failed",
                json!({"code":"SANDBOX_UNAVAILABLE","stage":error}),
            );
            std::process::exit(1);
        }
    }
}
