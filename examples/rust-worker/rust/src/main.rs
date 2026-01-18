use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};

/// JSON-RPC 2.0 request.
#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

/// JSON-RPC 2.0 response (success).
#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    result: Value,
}

/// JSON-RPC 2.0 response (error).
#[derive(Debug, Serialize)]
struct JsonRpcError {
    jsonrpc: String,
    id: Value,
    error: ErrorObject,
}

#[derive(Debug, Serialize)]
struct ErrorObject {
    code: i32,
    message: String,
}

/// JSON-RPC 2.0 notification.
#[derive(Debug, Serialize)]
struct JsonRpcNotification {
    jsonrpc: String,
    method: String,
    params: Value,
}

/// Sends a JSON-RPC response.
fn send_response(id: Value, result: Value) {
    let response = JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result,
    };
    if let Ok(json) = serde_json::to_string(&response) {
        println!("{}", json);
    }
}

/// Sends a JSON-RPC error.
fn send_error(id: Value, code: i32, message: String) {
    let error = JsonRpcError {
        jsonrpc: "2.0".to_string(),
        id,
        error: ErrorObject { code, message },
    };
    if let Ok(json) = serde_json::to_string(&error) {
        println!("{}", json);
    }
}

/// Sends a JSON-RPC notification.
fn send_notification(method: &str, params: Value) {
    let notification = JsonRpcNotification {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
    };
    if let Ok(json) = serde_json::to_string(&notification) {
        println!("{}", json);
    }
}

/// Computes Fibonacci number (recursive, for demonstration).
fn fibonacci(n: u64) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

/// Checks if a number is prime.
fn is_prime(n: u64) -> bool {
    if n < 2 {
        return false;
    }
    if n == 2 {
        return true;
    }
    if n % 2 == 0 {
        return false;
    }
    let sqrt = (n as f64).sqrt() as u64;
    for i in (3..=sqrt).step_by(2) {
        if n % i == 0 {
            return false;
        }
    }
    true
}

/// Handles a JSON-RPC request.
fn handle_request(request: JsonRpcRequest) {
    // If no id, it's a notification
    let id = match request.id {
        Some(id) => id,
        None => {
            // Handle notification
            match request.method.as_str() {
                "shutdown" => {
                    send_notification("log", serde_json::json!({ "message": "Shutting down..." }));
                    std::process::exit(0);
                }
                _ => {
                    send_notification(
                        "log",
                        serde_json::json!({ "message": format!("Unknown notification: {}", request.method) }),
                    );
                }
            }
            return;
        }
    };

    // Handle request
    let result = match request.method.as_str() {
        "add" => {
            let a = request.params["a"].as_i64().unwrap_or(0);
            let b = request.params["b"].as_i64().unwrap_or(0);
            serde_json::json!(a + b)
        }
        "multiply" => {
            let a = request.params["a"].as_i64().unwrap_or(0);
            let b = request.params["b"].as_i64().unwrap_or(0);
            serde_json::json!(a * b)
        }
        "fibonacci" => {
            let n = request.params["n"].as_u64().unwrap_or(0);
            serde_json::json!(fibonacci(n))
        }
        "is_prime" => {
            let n = request.params["n"].as_u64().unwrap_or(0);
            serde_json::json!(is_prime(n))
        }
        "sum_array" => {
            let numbers = request.params["numbers"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_i64())
                        .sum::<i64>()
                })
                .unwrap_or(0);
            serde_json::json!(numbers)
        }
        "echo" => {
            let message = request.params["message"].as_str().unwrap_or("");
            serde_json::json!(message)
        }
        _ => {
            send_error(id, -32601, format!("Method not found: {}", request.method));
            return;
        }
    };

    send_response(id, result);

    // Send notification about processed request
    send_notification(
        "log",
        serde_json::json!({ "message": format!("Processed {}", request.method) }),
    );
}

fn main() {
    // Send startup notification
    send_notification("log", serde_json::json!({ "message": "Rust worker started" }));

    // Read line-delimited JSON-RPC from stdin
    let stdin = io::stdin();
    let reader = stdin.lock();

    for line in reader.lines() {
        match line {
            Ok(line) => {
                match serde_json::from_str::<JsonRpcRequest>(&line) {
                    Ok(request) => handle_request(request),
                    Err(e) => {
                        send_notification(
                            "log",
                            serde_json::json!({ "message": format!("Parse error: {}", e) }),
                        );
                    }
                }
            }
            Err(_) => break,
        }
    }
}
