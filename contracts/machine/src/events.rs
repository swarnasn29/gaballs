//! NEP-297 events: standard "gaballs", version "1.0.0".

use near_sdk::env;
use near_sdk::serde::Serialize;
use near_sdk::serde_json::json;

pub const STANDARD: &str = "gaballs";
pub const VERSION: &str = "1.0.0";

pub fn emit<T: Serialize>(event: &str, data: &T) {
    let body = json!({ "standard": STANDARD, "version": VERSION, "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{body}"));
}
