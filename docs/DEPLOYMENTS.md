# Deployments (testnet)

## Accounts

| Account | Role | Created by (tx) |
| --- | --- | --- |
| `gaballs.testnet` | Root; future factory | [3MiCxjFC…](https://explorer.testnet.near.org/transactions/3MiCxjFCY4iLG6GQgNduks27CqcUTjoZApejGuGiEE9W) (faucet) |
| `buyer1.gaballs.testnet` | Test buyer | [EwqBQBwp…](https://explorer.testnet.near.org/transactions/EwqBQBwpiHipLP4Y5MdHM4hqFcEwFV2RFyZLvZqyq3FW) |
| `buyer2.gaballs.testnet` | Test buyer | [7FB8ZNUX…](https://explorer.testnet.near.org/transactions/7FB8ZNUXcUVEtrYhcZeBT9iBz6XTU7Fq7UGGiJkQnUpM) |

Check any of them: `near account view-account-summary <account> network-config testnet now`

Contract deployments are added here as they happen.

## Testnet NEAR top-ups

The faucet funds each new account with 10 testnet NEAR. To fund `gaballs.testnet`, throwaway faucet accounts were
created and then deleted with `gaballs.testnet` as beneficiary (deleting an account sends its whole balance there).

| Date | Helper account | Created (faucet) | Deleted → gaballs.testnet | Root balance after |
| --- | --- | --- | --- | --- |
| 2026-11-11 | `gaballs-topup1.testnet` | [9h3qZi46…](https://explorer.testnet.near.org/transactions/9h3qZi46rNPQk38Wj7T4UwNDEGB8SuQdmvGEFyaBptfC) | [4XFUPHHo…](https://explorer.testnet.near.org/transactions/4XFUPHHoMXnxfVDFXwURBEyBDUZz2uuN8fb3EfGcuQU8) | |
| 2026-11-11 | `gaballs-topup2.testnet` | [FRjm8XzA…](https://explorer.testnet.near.org/transactions/FRjm8XzARf4Dj2JdX7mSYSuVctxQQLdSgS4KfbyYrzxS) | [Aw3nUWkW…](https://explorer.testnet.near.org/transactions/Aw3nUWkWBbMtYVkQFU3pQJBimUWB22Q73uh3shVBTXBY) | 27.99 NEAR |
