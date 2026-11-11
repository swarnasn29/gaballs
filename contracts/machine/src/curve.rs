//! Constant-product bonding curve with a virtual USDT reserve (CLAUDE.md section 2).
//!
//! k = (V + R) * T stays constant on a buy. (V + R) * T overflows u128 once tokens have 18 decimals,
//! so all products are computed in 256 bits. Every rounding step favours the contract.

#![allow(clippy::manual_div_ceil, clippy::assign_op_pattern)]

uint::construct_uint! {
    pub struct U256(4);
}

/// USDT has 6 decimals; prices are reported with 18. Tokens have 18 decimals.
/// price_wad = (V + R) * 10^12 * 10^18 / T  =  USDT per whole token, scaled by 10^18.
const PRICE_SCALE: u128 = 1_000_000_000_000_000_000_000_000_000_000; // 10^30

/// Tokens bought with `usdt_in` (after fees), given virtual reserve `v`, real reserve `r` and curve
/// inventory `t`. bought = T - ceil((V+R)*T / (V+R+u)): the remaining inventory is rounded up, so the
/// buyer gets the floor.
pub fn tokens_out(v: u128, r: u128, t: u128, usdt_in: u128) -> u128 {
    let k = U256::from(v) + U256::from(r);
    let t = U256::from(t);
    let denom = k + U256::from(usdt_in);
    let new_t = (k * t + denom - U256::one()) / denom;
    (t - new_t).as_u128()
}

/// Spot price: USDT per whole token, scaled by 10^18 (saturates at u128::MAX).
pub fn price_wad(v: u128, r: u128, t: u128) -> u128 {
    if t == 0 {
        return u128::MAX;
    }
    let p = (U256::from(v) + U256::from(r)) * U256::from(PRICE_SCALE) / U256::from(t);
    if p > U256::from(u128::MAX) { u128::MAX } else { p.as_u128() }
}

/// `a * b / d` in 256 bits, rounded down (saturates at u128::MAX; 0 if d == 0).
pub fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    if d == 0 {
        return 0;
    }
    let r = U256::from(a) * U256::from(b) / U256::from(d);
    if r > U256::from(u128::MAX) { u128::MAX } else { r.as_u128() }
}

/// `amount * bps / 10_000`, rounded down.
pub fn bps_of(amount: u128, bps: u32) -> u128 {
    (U256::from(amount) * U256::from(bps) / U256::from(10_000u32)).as_u128()
}
