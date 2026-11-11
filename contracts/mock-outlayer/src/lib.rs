//! Stand-in for OutLayer's `request_execution`, used ONLY by the sandbox tests (tests/sandbox). Never deployed.
//!
//! The real OutLayer runs a VRF module and returns `{"results":[{"alpha","signature_hex",...}]}` signed by its VRF
//! key. Here the test signs that response itself (with a test key the machine was launched with) and registers it with
//! `push_response(seed, response)`; `request_execution` answers the request whose input carries that seed (the
//! machine's unique `{machine}-{request_id}`), or fails if the registered response is `null`. Keyed by seed, so a
//! request that never reaches OutLayer (e.g. it ran out of gas earlier) cannot shift the answers of later ones.

use near_sdk::serde_json::Value;
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{AccountId, PanicOnDefault, env, near};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockOutLayer {
    /// Response per seed. `None` makes that request fail.
    responses: LookupMap<String, Option<String>>,
    /// The `input_data` of every request, so tests can see the seeds the machine sent.
    inputs: Vector<String>,
}

#[near]
impl MockOutLayer {
    #[init]
    pub fn new() -> Self {
        Self { responses: LookupMap::new(b"r"), inputs: Vector::new(b"i") }
    }

    /// Register the raw JSON answer for the request with this `seed`, or `null` to make it fail.
    pub fn push_response(&mut self, seed: String, response: Option<String>) {
        self.responses.insert(seed, response);
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
        let input = input_data.unwrap_or_default();
        self.inputs.push(input.clone());
        let seed = near_sdk::serde_json::from_str::<Value>(&input)
            .ok()
            .and_then(|v| v["seed"].as_str().map(str::to_string))
            .unwrap_or_else(|| env::panic_str("input has no seed"));
        let entry = self.responses.remove(&seed).unwrap_or_else(|| env::panic_str("no response for this seed"));
        match entry {
            Some(json) => near_sdk::serde_json::from_str(&json).unwrap_or_else(|_| env::panic_str("queued response is not JSON")),
            None => env::panic_str("mock OutLayer: execution failed"),
        }
    }

    pub fn get_inputs(&self) -> Vec<String> {
        self.inputs.iter().cloned().collect()
    }
}
