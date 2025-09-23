# GalaChain Scripts

## Prerequisites

Set these environment variables (for example in `.env`):

```
PRIVATE_KEY=0x...
WALLET_ADDRESS=eth|...
TRANSFER_RECIPIENT=client|...
```

Optionally override:

```
GALA_API_BASE=https://api-galaswap.gala.com    # defaults to this value
GALA_FEE_CHANNEL=asset                         # defaults to asset
```

Install dependencies once with:

```
npm install
```

## Authorize Fee Credits

```
npm run authorize-fee -- <amount>
```

Example:

```
npm run authorize-fee -- 1
```

Signs and submits a `FeeAuthorizationDto` to credit the requested amount of GALA fee tokens on the configured channel.

## Transfer GALA Tokens

```
npm run transfer -- <amount>
```

Example:

```
npm run transfer -- 99
```

Signs a `TransferTokenDto` moving the specified amount of GALA from `WALLET_ADDRESS` to `TRANSFER_RECIPIENT`.

> **Note:** Make sure you have authorized enough fee credits before transferring; otherwise the transfer call will fail with `Failed to burnTokens fee`.

## Inspect GALA Pools

```
npm run fetch-swaps
```

Optional overrides:

```
GALA_POOL_BASE=GALA                       # pool symbol to filter on
GALA_EXPLORE_API_BASE=https://dex-backend-prod1.defi.gala.com
GALA_POOL_PAGE_LIMIT=20                  # per-page fetch limit (max 20)
```

The script queries the public `/explore/pools` API and prints every pool that involves the configured base token. For each pool it shows both token prices, liquidity (TVL), and recent 24h volume.
