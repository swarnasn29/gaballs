//! Verifiable randomness from OutLayer VRF (https://outlayer.fastnear.com/docs/vrf, CLAUDE.md section 6).
//!
//! A pack payment becomes a pending pull and one VRF request to OutLayer. OutLayer's worker signs
//! `alpha = "vrf:{request_id}:{sender_id}:{seed}"` with the VRF key (Ed25519) and returns the alpha and signature.
//! The callback trusts nothing it is told except what it can check here:
//!   1. the signature is a valid Ed25519 signature over `alpha` by the VRF public key fixed at launch;
//!   2. `alpha` is for THIS pull: it ends in this machine's unique seed for the request and names the buyer
//!      (or the machine) as sender, so a valid proof from another request cannot be swapped in;
//!   3. the rolls come from SHA-256 of the signature, computed here. OutLayer's own `value` field is ignored.

use near_sdk::serde::Deserialize;
use near_sdk::{AccountId, env};

use crate::odds;

/// One VRF output as returned by the vrf-ark WASI module. Other fields (`value`, `verification`) are ignored.
#[derive(Deserialize, Debug, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct VrfEntry {
    pub alpha: String,
    pub signature_hex: String,
}

#[derive(Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct VrfResponse {
    pub results: Vec<VrfEntry>,
}

/// A checked proof: the alpha and the 64-byte signature.
pub struct Proof {
    pub alpha: String,
    pub signature: [u8; 64],
}

/// The user seed sent to OutLayer for request `request_id` of `machine`. Unique per machine and request, and free
/// of ':' (the VRF module rejects seeds containing it; account ids never contain one).
pub fn seed_for(machine: &AccountId, request_id: u64) -> String {
    format!("{machine}-{request_id}")
}

/// Parses OutLayer's JSON result and verifies the first entry. `Err` carries a short reason for the refund event.
pub fn verify(raw: &[u8], pubkey: &[u8; 32], buyer: &AccountId, machine: &AccountId, seed: &str) -> Result<Proof, String> {
    let response: VrfResponse =
        near_sdk::serde_json::from_slice(raw).map_err(|_| "VRF result is not valid JSON".to_string())?;
    let entry = response.results.into_iter().next().ok_or("VRF result has no entries")?;
    if !alpha_is_for(&entry.alpha, buyer, machine, seed) {
        return Err("VRF proof is for a different request".to_string());
    }
    let signature: [u8; 64] = from_hex(&entry.signature_hex)
        .and_then(|b| b.try_into().ok())
        .ok_or("VRF signature is not 64 bytes of hex")?;
    if !env::ed25519_verify(&signature, entry.alpha.as_bytes(), pubkey) {
        return Err("VRF signature does not verify".to_string());
    }
    Ok(Proof { alpha: entry.alpha, signature })
}

/// `vrf:{digits}:{buyer or machine}:{seed}`, exactly.
pub fn alpha_is_for(alpha: &str, buyer: &AccountId, machine: &AccountId, seed: &str) -> bool {
    let Some(rest) = alpha.strip_prefix("vrf:") else { return false };
    let mut parts = rest.splitn(3, ':');
    let (Some(request_id), Some(sender), Some(user_seed)) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    !request_id.is_empty()
        && request_id.bytes().all(|b| b.is_ascii_digit())
        && (sender == buyer.as_str() || sender == machine.as_str())
        && user_seed == seed
}

/// Rolls for `count` packs from one verified signature: output = SHA-256(signature) (the VRF output as defined by
/// OutLayer); pack i uses h_i = SHA-256(output ++ [i]) and roll_i = first 8 bytes of h_i (big-endian) mod 10,000.
pub fn rolls(signature: &[u8; 64], count: u32) -> Vec<(u16, [u8; 32])> {
    let output = env::sha256_array(signature);
    (0..count)
        .map(|i| {
            let mut data = output.to_vec();
            data.push(i as u8);
            let h = env::sha256_array(&data);
            let first8: [u8; 8] = h[..8].try_into().unwrap();
            ((u64::from_be_bytes(first8) % u64::from(odds::BPS)) as u16, h)
        })
        .collect()
}

pub fn from_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}
