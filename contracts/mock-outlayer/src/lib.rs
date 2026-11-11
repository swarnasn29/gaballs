//! Stand-in for OutLayer's `request_execution`, used ONLY by the sandbox tests (tests/sandbox). Never deployed.
//!
//! The real OutLayer runs a VRF module and returns `{"results":[{"alpha","signature_hex",...}]}` signed by its VRF
//! key. Here the test signs that response itself (with a test key the machine was launched with) and queues it with
//! `push_response`; `request_execution` returns the next queued response, or fails if the queued entry is `null`.

use near_sdk::serde_json::Value;
use near_sdk::store::Vector;
use near_sdk::{AccountId, PanicOnDefault, env, near};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockOutLayer {
    /// Queued responses, served in order. `None` makes that request fail.
    queue: Vector<Option<String>>,
    next: u32,
    /// The `input_data` of every request, so tests can see the seeds the machine sent.
    inputs: Vector<String>,
}

#[near]
impl MockOutLayer {
    #[init]
    pub fn new() -> Self {
        Self { queue: Vector::new(b"q"), next: 0, inputs: Vector::new(b"i") }
    }

    /// Queue the raw JSON for the next request, or `null` to make it fail.
    pub fn push_response(&mut self, response: Option<String>) {
        self.queue.push(response);
    }

    /// Same signature as OutLayer's. Keeps the attached deposit (the real one refunds what it does not use).
    #[payable]
    pub fn request_execution(
        &mut self,
        source: Value,
        resource_limits: Option<Value>,
        input_data: Option<String>,
        secrets_ref: Option<Value>,
        response_format: Option<String>,
        payer_account_id: Option<AccountId>,
    ) -> Value {
        let _ = (source, resource_limits, secrets_ref, response_format, payer_account_id);
        self.inputs.push(input_data.unwrap_or_default());
        let entry = self.queue.get(self.next).cloned().unwrap_or_else(|| env::panic_str("no response queued"));
        self.next += 1;
        match entry {
            Some(json) => near_sdk::serde_json::from_str(&json).unwrap_or_else(|_| env::panic_str("queued response is not JSON")),
            None => env::panic_str("mock OutLayer: execution failed"),
        }
    }

    pub fn get_inputs(&self) -> Vec<String> {
        self.inputs.iter().cloned().collect()
    }
}
