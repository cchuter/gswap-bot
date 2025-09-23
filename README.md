# Buffet Bot 🐢

Welcome to **Buffet Bot**, a Warren-Buffet-inspired "buy and hooooooolllllldddd" automation for the GALA ↔ GWBTC pair. This bot keeps a long-term view: watch the market, act deliberately, and document every move. The tortoise wins the race.

## What It Does

- 🔄 **Simple Swap Runner** – Execute full-position swaps between GALA and GWBTC on demand using the GSwap SDK.
- 📈 **Portfolio Console UI** – Live terminal dashboard showing balances, spot prices, USD markers, and a running PnL snapshot.
- 🗂️ **Swap History Tracking** – Append-only JSONL log (`swap-history.log`) of every trade for auditability.
- 🔐 **Key Handling Utilities** – Optional helper (`npm run decrypt`) to turn an encrypted Gala private key into a usable signer secret.

## Prerequisites

- Node.js 20 LTS
- npm
- Gala wallet private key (encrypted or plain) and wallet address

## Getting Started

1. **Clone & install**

   ```bash
   git clone <repository-url>
   cd gswap-bot
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Update `.env` with at least:

   - `WALLET_ADDRESS`
   - `PRIVATE_KEY` *or* `PRIVATE_KEY_ENCRYPTED`

   Optional knobs include refresh cadence, slippage, fee tier, and API base overrides. Check in-code defaults inside `gswap.ts` for the full list.

3. **(Optional) Decrypt your key**

   ```bash
   npm run decrypt
   ```

   Supply the encrypted blob and Gala Transfer Code; the script writes the decrypted key to stdout so you can paste it into `.env`.

4. **Launch the Buffet Bot console**

   ```bash
   npm run start
   ```

   or hot-reload during development:

   ```bash
   npm run dev
   ```

   The terminal UI updates on the configured interval. Commands:

   - `start` – Move your entire GALA balance into GWBTC.
   - `stop` – Move your entire GWBTC balance back into GALA.
   - `refresh` – Force an immediate data refresh.

   Every swap attempt is logged and PnL is recalculated on each redraw so you always know how diamond-handed Buffet Bot really is.

## Environment Reference

| Variable | Purpose | Required |
| -------- | ------- | -------- |
| `WALLET_ADDRESS` | Wallet to manage | ✅ |
| `PRIVATE_KEY` | Plain signer key | ✅* |
| `PRIVATE_KEY_ENCRYPTED` | Encrypted key consumed by `npm run decrypt` | ✅* |
| `GALA_TUI_REFRESH_MS` | UI refresh interval (ms) | Optional |
| `GALA_WBTC_SLIPPAGE_BPS` | Slippage guardrail in basis points | Optional |
| `GALA_WBTC_FEE` | Pool fee tier if you want to override the default | Optional |
| `GALA_SWAP_LOG` | Alternate path for swap history | Optional |

`*` Provide either `PRIVATE_KEY` directly or keep `PRIVATE_KEY_ENCRYPTED` alongside the decrypt script output.

## Available Scripts

| Script | Description |
| ------ | ----------- |
| `npm run start` | Runs `gswap.ts` in production mode; continuously checks the GALA ↔ GWETH pool and logs arbitrage signals to `gswap.log`. |
| `npm run dev` | Launches the arbitrage monitor with `tsx watch` so code changes reload automatically. |
| `npm run build` | Type-checks and emits compiled JavaScript into `dist/` using the project `tsconfig.json`. |
| `npm run decrypt` | Opens the interactive decrypt utility (`decrypt.ts`) to turn `PRIVATE_KEY_ENCRYPTED` + transfer code into a usable signer key. |
| `npm run pool-monitor` | Executes `pool-monitor.ts`; pass `analyze` (default) for a snapshot report or `monitor` for long-running live swap detection. |
| `npm run quote -- <amount> [giving receiving]` | Calls `scripts/quote-swap.ts` to fetch a live quote (defaults to GALA→GWBTC) and prints USD equivalents. Override CoinGecko IDs with `COINGECKO_<SYMBOL>_ID` if a token is missing. |
| `npm run authorize-fee -- <amount>` | Calls `scripts/authorize-fee.ts` to mint fee credits. If you see `Fee amount must be a positive number`, rerun with a numeric amount, e.g. `npm run authorize-fee -- 1`. |
| `npm run transfer -- <amount>` | Invokes `scripts/transfer-gala.ts` to send GALA to `TRANSFER_RECIPIENT`; requires fee credits on chain. |
| `npm run fetch-swaps` | Hits the Gala explore API via `scripts/fetch-swaps.ts` and prints pools; see `scripts/README.md` for optional filters. |

## Safety Notes

- Never commit `.env` or raw keys.
- Keep the machine running Buffet Bot secure; swaps execute with your wallet authority.
- Rotate credentials regularly; document required variables in `docs/configuration.md` if you change them.

## License

Apache 2.0
