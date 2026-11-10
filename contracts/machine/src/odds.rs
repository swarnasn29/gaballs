//! The fixed, public odds table (CLAUDE.md section 2).

use near_sdk::near;

pub const BPS: u32 = 10_000;
/// Index of the Mythic tier.
pub const MYTHIC: usize = 3;

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Tier {
    pub name: String,
    /// Chance out of 10,000.
    pub chance_bps: u16,
    /// Multiplier out of 10,000 (7,000 = 0.70x).
    pub multiplier_bps: u32,
}

pub fn default_odds() -> Vec<Tier> {
    [("Common", 7_500, 7_000), ("Rare", 2_000, 12_500), ("Epic", 400, 25_000), ("Mythic", 100, 80_000)]
        .into_iter()
        .map(|(name, chance_bps, multiplier_bps)| Tier { name: name.to_string(), chance_bps, multiplier_bps })
        .collect()
}

/// Index of the tier a roll in [0, 10,000) lands in, using cumulative chances in table order.
pub fn tier_for_roll(odds: &[Tier], roll: u16) -> usize {
    let mut cumulative = 0u32;
    for (i, tier) in odds.iter().enumerate() {
        cumulative += u32::from(tier.chance_bps);
        if u32::from(roll) < cumulative {
            return i;
        }
    }
    odds.len() - 1
}

/// Expected multiplier in bps: sum(chance * multiplier) / 10,000. 9,550 for the default table.
pub fn expected_multiplier_bps(odds: &[Tier]) -> u32 {
    odds.iter().map(|t| u32::from(t.chance_bps) * t.multiplier_bps).sum::<u32>() / BPS
}
