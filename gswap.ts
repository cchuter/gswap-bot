import { GSwap, PrivateKeySigner, FEE_TIER } from '@gala-chain/gswap-sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import BigNumber from 'bignumber.js';
import readline from 'readline';
import fs from 'fs';

dotenv.config();

const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const GALA_TOKEN = 'GALA|Unit|none|none';
const WBTC_TOKEN = 'GWBTC|Unit|none|none';
const DEFAULT_FEE = Number(process.env.GALA_WBTC_FEE ?? FEE_TIER.PERCENT_01_00);
const UPDATE_INTERVAL_MS = Number(process.env.GALA_TUI_REFRESH_MS ?? '60000');
const BALANCE_PAGE_SIZE = Number(process.env.GALA_BALANCE_PAGE_SIZE ?? '20');
const TOKEN_API_BASE = process.env.GALA_TOKEN_API_BASE ?? 'https://api-galaswap.gala.com';
const LOG_PATH = process.env.GALA_SWAP_LOG ?? 'swap-history.log';
const ACTIVITY_LOG_PATH = process.env.GALA_ACTIVITY_LOG ?? 'gswap.log';

if (!Number.isFinite(UPDATE_INTERVAL_MS) || UPDATE_INTERVAL_MS <= 0) {
  throw new Error('GALA_TUI_REFRESH_MS must be a positive number');
}

const pageSize = !Number.isFinite(BALANCE_PAGE_SIZE) || BALANCE_PAGE_SIZE <= 0 ? 20 : Math.min(BALANCE_PAGE_SIZE, 100);

const rawSlippage = Number(process.env.GALA_WBTC_SLIPPAGE_BPS ?? '100');
const clampedSlippage = Math.min(Math.max(Number.isFinite(rawSlippage) ? rawSlippage : 100, 0), 10_000);
const SLIPPAGE_DECIMAL = new BigNumber(clampedSlippage).dividedBy(10_000);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.setPrompt('');

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function resolveGalaAddress(address: string): string {
  if (address.includes('|')) return address;
  if (address.toLowerCase().startsWith('0x')) {
    return `eth|${address.slice(2)}`;
  }
  return address;
}

function formatAmount(value: BigNumber, maxDecimals = 8): string {
  if (!value.isFinite()) return value.toString();
  return value.decimalPlaces(maxDecimals, BigNumber.ROUND_DOWN).toString();
}

interface PriceInfo {
  wbtcPerGala: BigNumber;
  galaPerWbtc: BigNumber;
}

interface UsdPrices {
  galaUsd: BigNumber | null;
  wbtcUsd: BigNumber | null;
}

interface SwapLogEntry {
  timestamp: string;
  direction: 'start' | 'stop';
  amountIn: string;
  quotedAmountOut: string;
  minAmountOut: string;
  price: string;
  feeTier: number;
  slippageBps: number;
  txId: string | null;
  transactionHash: string | null;
  walletAddress: string;
}

interface PortfolioPnl {
  totalGalaIn: BigNumber;
  totalGalaOut: BigNumber;
  totalWbtcIn: BigNumber;
  totalWbtcOut: BigNumber;
  realizedUsd: BigNumber;
  unrealizedUsd: BigNumber;
  netCostUsd: BigNumber;
}

function createEmptyPnl(): PortfolioPnl {
  return {
    totalGalaIn: new BigNumber(0),
    totalGalaOut: new BigNumber(0),
    totalWbtcIn: new BigNumber(0),
    totalWbtcOut: new BigNumber(0),
    realizedUsd: new BigNumber(0),
    unrealizedUsd: new BigNumber(0),
    netCostUsd: new BigNumber(0),
  };
}

function appendActivityLog(message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    message,
    ...(details ? { details } : {}),
  };

  fs.appendFile(ACTIVITY_LOG_PATH, `${JSON.stringify(entry)}\n`, (err) => {
    if (err) {
      console.error('Failed to write activity log:', err instanceof Error ? err.message : String(err));
    }
  });
}


function renderTui(
  balances: { gala: BigNumber; wbtc: BigNumber },
  priceInfo: PriceInfo | null,
  usdPrices: UsdPrices,
  pnl: PortfolioPnl,
  lastBalanceError: string | null,
  lastPriceError: string | null,
  lastUsdError: string | null,
  lastCommandMessage: string | null,
  swapInProgress: boolean
): void {
  console.clear();
  console.log('=== Gala ↔ WBTC Monitor ===');
  console.log(`Updated: ${new Date().toLocaleString()}`);

  if (lastBalanceError) {
    console.log(`Balance error: ${lastBalanceError}`);
  }

  console.log('\nBalances:');
  console.log(`- GALA : ${formatAmount(balances.gala, 8)}`);
  console.log(`- GWBTC: ${formatAmount(balances.wbtc, 8)}`);

  if (priceInfo) {
    console.log('\nPrices (spot):');
    console.log(`- 1 GALA  = ${formatAmount(priceInfo.wbtcPerGala, 12)} GWBTC`);
    console.log(`- 1 GWBTC = ${formatAmount(priceInfo.galaPerWbtc, 8)} GALA`);
  } else {
    console.log('\nPrices: unavailable');
    if (lastPriceError) {
      console.log(`Reason: ${lastPriceError}`);
    }
  }

  console.log('\nUSD Prices:');
  if (usdPrices.galaUsd) {
    console.log(`- GALA : $${formatAmount(usdPrices.galaUsd, 6)}`);
  } else {
    console.log('- GALA : unavailable');
  }
  if (usdPrices.wbtcUsd) {
    console.log(`- GWBTC: $${formatAmount(usdPrices.wbtcUsd, 2)}`);
  } else {
    console.log('- GWBTC: unavailable');
  }
  if (lastUsdError) {
    console.log(`USD price warning: ${lastUsdError}`);
  }

  const totalHoldingsUsd = (() => {
    if (!usdPrices.galaUsd || !usdPrices.wbtcUsd) return new BigNumber(0);
    const galaValue = balances.gala.multipliedBy(usdPrices.galaUsd);
    const wbtcValue = balances.wbtc.multipliedBy(usdPrices.wbtcUsd);
    return galaValue.plus(wbtcValue);
  })();

  console.log('\nPnL:');
  console.log(`- Realized PnL: $${formatAmount(pnl.realizedUsd, 2)}`);
  console.log(`- Unrealized PnL (current holdings): $${formatAmount(totalHoldingsUsd.minus(pnl.netCostUsd), 2)}`);
  console.log(`- Net hold cost: $${formatAmount(pnl.netCostUsd, 2)}`);
  console.log(`- Current portfolio value: $${formatAmount(totalHoldingsUsd, 2)}`);

  if (lastCommandMessage) {
    console.log(`\nLast action: ${lastCommandMessage}`);
  }

  if (swapInProgress) {
    console.log('\nSwap in progress...');
  }

  console.log('\nCommands:');
  console.log('  start               - swap all GALA into GWBTC');
  console.log('  stop                - swap all GWBTC into GALA');
  console.log('  refresh             - force immediate refresh');
  console.log('  dexbuy <gala>       - swap GALA → GWBTC using the DEX pool');
  console.log('\nRefresh interval: ' + UPDATE_INTERVAL_MS / 1000 + 's (Ctrl+C to exit)');
}

async function fetchBalances(gSwap: GSwap, walletAddress: string) {
  const galaAddress = resolveGalaAddress(walletAddress);
  const tokens = await gSwap.assets.getUserAssets(galaAddress, 1, pageSize);

  const result = {
    gala: new BigNumber(0),
    wbtc: new BigNumber(0),
  };

  tokens.tokens.forEach((token) => {
    const quantity = new BigNumber(token.quantity);
    if (token.symbol.toUpperCase() === 'GALA') {
      result.gala = quantity;
    }
    if (token.symbol.toUpperCase() === 'GWBTC') {
      result.wbtc = quantity;
    }
  });

  return result;
}

async function fetchSpotPrice(gSwap: GSwap): Promise<PriceInfo> {
  const attempts: Array<{ tokenIn: string; tokenOut: string }> = [
    { tokenIn: GALA_TOKEN, tokenOut: WBTC_TOKEN },
    { tokenIn: WBTC_TOKEN, tokenOut: GALA_TOKEN },
  ];

  for (const { tokenIn, tokenOut } of attempts) {
    try {
      const pool = await gSwap.pools.getPoolData(tokenIn, tokenOut, DEFAULT_FEE);
      const spot = new BigNumber(gSwap.pools.calculateSpotPrice(tokenIn, tokenOut, pool.sqrtPrice));
      if (!spot.isFinite() || spot.lte(0)) {
        continue;
      }

      if (tokenIn === GALA_TOKEN) {
        const wbtcPerGala = spot;
        const galaPerWbtc = BigNumber(1).dividedBy(wbtcPerGala);
        return { wbtcPerGala, galaPerWbtc };
      }

      const galaPerWbtc = spot;
      const wbtcPerGala = BigNumber(1).dividedBy(galaPerWbtc);
      return { wbtcPerGala, galaPerWbtc };
    } catch {
      // try next ordering
    }
  }

  throw new Error('Unable to fetch spot price for GALA/WBTC');
}

async function fetchUsdPrices(): Promise<UsdPrices> {
  const { data } = await axios.get<{ tokens: Array<{ symbol: string; currentPrices?: { usd?: number } }> }>(
    `${TOKEN_API_BASE}/v1/tokens`,
    {
      headers: { Accept: 'application/json' },
      timeout: 10_000,
    }
  );

  const tokens = data.tokens ?? [];
  const findPrice = (symbol: string) => {
    const entry = tokens.find((token) => token.symbol?.toUpperCase() === symbol.toUpperCase());
    if (!entry || entry.currentPrices?.usd == null) {
      return null;
    }
    return new BigNumber(entry.currentPrices.usd);
  };

  return {
    galaUsd: findPrice('GALA'),
    wbtcUsd: findPrice('GWBTC'),
  };
}

function readSwapHistory(): SwapLogEntry[] {
  if (!fs.existsSync(LOG_PATH)) {
    return [];
  }

  const entries: SwapLogEntry[] = [];

  const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as SwapLogEntry;
      if (entry && (entry.direction === 'start' || entry.direction === 'stop')) {
        entries.push(entry);
      }
    } catch {
      // ignore malformed line
    }
  }

  return entries;
}

function computePnl(entries: SwapLogEntry[], usdPrices: UsdPrices): PortfolioPnl {
  const result = createEmptyPnl();

  let runningGala = new BigNumber(0);
  let runningWbtc = new BigNumber(0);
  let realizedUsd = new BigNumber(0);
  let netCostUsd = new BigNumber(0);

  entries.forEach((entry) => {
    const amountIn = new BigNumber(entry.amountIn);
    const amountOut = new BigNumber(entry.quotedAmountOut);

    if (entry.direction === 'start') {
      // swapping GALA -> WBTC; treat as selling GALA for WBTC
      runningGala = runningGala.minus(amountIn);
      runningWbtc = runningWbtc.plus(amountOut);
      result.totalGalaOut = result.totalGalaOut.plus(amountIn);
      result.totalWbtcIn = result.totalWbtcIn.plus(amountOut);

      // update net cost basis using USD price if available
      if (usdPrices.galaUsd) {
        const saleUsd = amountIn.multipliedBy(usdPrices.galaUsd);
        netCostUsd = netCostUsd.minus(saleUsd);
        realizedUsd = realizedUsd.plus(saleUsd);
      }
    } else {
      // swapping WBTC -> GALA; treat as selling WBTC for GALA
      runningWbtc = runningWbtc.minus(amountIn);
      runningGala = runningGala.plus(amountOut);
      result.totalWbtcOut = result.totalWbtcOut.plus(amountIn);
      result.totalGalaIn = result.totalGalaIn.plus(amountOut);

      if (usdPrices.wbtcUsd) {
        const saleUsd = amountIn.multipliedBy(usdPrices.wbtcUsd);
        netCostUsd = netCostUsd.minus(saleUsd);
        realizedUsd = realizedUsd.plus(saleUsd);
      }
    }
  });

  // Current holdings value
  const galaValue = usdPrices.galaUsd ? runningGala.multipliedBy(usdPrices.galaUsd) : new BigNumber(0);
  const wbtcValue = usdPrices.wbtcUsd ? runningWbtc.multipliedBy(usdPrices.wbtcUsd) : new BigNumber(0);
  const holdingsUsd = galaValue.plus(wbtcValue);

  result.realizedUsd = realizedUsd;
  result.unrealizedUsd = holdingsUsd.plus(netCostUsd);
  result.netCostUsd = netCostUsd;

  return result;
}

async function quoteSwap(
  gSwap: GSwap,
  tokenIn: string,
  tokenOut: string,
  amountIn: BigNumber
) {
  const quote = await gSwap.quoting.quoteExactInput(tokenIn, tokenOut, amountIn.toString(), DEFAULT_FEE);
  const amountOut = new BigNumber(quote.outTokenAmount);
  const price = amountOut.dividedBy(amountIn);
  return {
    amountOut,
    price,
  };
}

async function submitDexBuySwap(
  gSwap: GSwap,
  galaAddress: string,
  amountIn: BigNumber
) {
  const { amountOut, price } = await quoteSwap(gSwap, GALA_TOKEN, WBTC_TOKEN, amountIn);
  const slipMultiplier = new BigNumber(1).minus(SLIPPAGE_DECIMAL);
  const amountInString = amountIn.decimalPlaces(8, BigNumber.ROUND_FLOOR).toString();
  const minOut = amountOut.multipliedBy(slipMultiplier);
  const minOutString = minOut.decimalPlaces(8, BigNumber.ROUND_FLOOR).toString();

  appendActivityLog('swap_submitted', {
    direction: 'dexbuy',
    amountIn: amountInString,
    minAmountOut: minOutString,
    feeTier: DEFAULT_FEE,
  });

  const pendingTx = await gSwap.swaps.swap(
    GALA_TOKEN,
    WBTC_TOKEN,
    DEFAULT_FEE,
    {
      exactIn: amountInString,
      amountOutMinimum: minOutString,
    },
    galaAddress
  );

  const receipt = await pendingTx.wait();

  const logEntry = {
    timestamp: new Date().toISOString(),
    direction: 'dexbuy' as const,
    amountIn: amountInString,
    quotedAmountOut: amountOut.toString(),
    minAmountOut: minOutString,
    price: price.toString(),
    feeTier: DEFAULT_FEE,
    slippageBps: clampedSlippage,
    txId: (receipt as any)?.txId ?? null,
    transactionHash: (receipt as any)?.transactionHash ?? null,
    walletAddress: galaAddress,
  };

  fs.appendFile(LOG_PATH, JSON.stringify(logEntry) + '\n', (err) => {
    if (err) {
      console.error('Failed to write swap log:', err.message ?? err);
    }
  });

  appendActivityLog('swap_confirmed', {
    direction: 'dexbuy',
    amountIn: amountInString,
    quotedAmountOut: amountOut.toString(),
    minAmountOut: minOutString,
    transactionHash: (receipt as any)?.transactionHash ?? null,
    txId: (receipt as any)?.txId ?? null,
  });

  return { receipt, amountOut, minOut };
}

async function main(): Promise<void> {
  const walletAddress = requireEnv(WALLET_ADDRESS, 'WALLET_ADDRESS');
  const privateKey = requireEnv(PRIVATE_KEY, 'PRIVATE_KEY');

  const gSwap = new GSwap({
    signer: new PrivateKeySigner(privateKey),
  });

  try {
    if (!GSwap.events.eventSocketConnected()) {
      await GSwap.events.connectEventSocket(gSwap.bundlerBaseUrl);
    }
  } catch (error) {
    console.error('Failed to establish GSwap socket connection:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const galaAddress = resolveGalaAddress(walletAddress);

  let lastBalanceError: string | null = null;
  let lastPriceError: string | null = null;
  let lastUsdError: string | null = null;
  let lastCommandMessage: string | null = 'Ready. Type commands below.';
  let swapInProgress = false;

  let latestBalances = {
    gala: new BigNumber(0),
    wbtc: new BigNumber(0),
  };
  let latestPrices: PriceInfo | null = null;
  let latestUsdPrices: UsdPrices = { galaUsd: null, wbtcUsd: null };
  let latestPnl = createEmptyPnl();

  const refresh = async () => {
    try {
      latestBalances = await fetchBalances(gSwap, galaAddress);
      lastBalanceError = null;
    } catch (error) {
      lastBalanceError = error instanceof Error ? error.message : String(error);
      latestBalances = { gala: new BigNumber(0), wbtc: new BigNumber(0) };
    }

    try {
      latestPrices = await fetchSpotPrice(gSwap);
      lastPriceError = null;
    } catch (error) {
      lastPriceError = error instanceof Error ? error.message : String(error);
      latestPrices = null;
    }

    try {
      latestUsdPrices = await fetchUsdPrices();
      lastUsdError = null;
    } catch (error) {
      lastUsdError = error instanceof Error ? error.message : String(error);
      latestUsdPrices = { galaUsd: null, wbtcUsd: null };
    }

    try {
      const swapHistory = readSwapHistory();
      latestPnl = computePnl(swapHistory, latestUsdPrices);
    } catch (error) {
      console.error('Failed to compute PnL:', error instanceof Error ? error.message : error);
      latestPnl = createEmptyPnl();
    }

    renderTui(
      latestBalances,
      latestPrices,
      latestUsdPrices,
      latestPnl,
      lastBalanceError,
      lastPriceError,
      lastUsdError,
      lastCommandMessage,
      swapInProgress
    );
  };

  await refresh();

  const interval = setInterval(refresh, UPDATE_INTERVAL_MS);

  const handleCommand = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const parts = trimmed.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    if (command === 'refresh') {
      lastCommandMessage = 'Manual refresh requested.';
      await refresh();
      return;
    }

    if (command === 'dexbuy') {
      const amountArg = args[0];
      if (!amountArg) {
        lastCommandMessage = 'Usage: dexbuy <galaAmount>';
        renderTui(
          latestBalances,
          latestPrices,
          latestUsdPrices,
          latestPnl,
          lastBalanceError,
          lastPriceError,
          lastUsdError,
          lastCommandMessage,
          swapInProgress
        );
        return;
      }

      const dexAmount = new BigNumber(amountArg);
      if (!dexAmount.isFinite() || dexAmount.lte(0)) {
        lastCommandMessage = 'Invalid amount. Provide a positive number of GALA to sell.';
        renderTui(
          latestBalances,
          latestPrices,
          latestUsdPrices,
          latestPnl,
          lastBalanceError,
          lastPriceError,
          lastUsdError,
          lastCommandMessage,
          swapInProgress
        );
        return;
      }

      if (dexAmount.gt(latestBalances.gala)) {
        lastCommandMessage = `Insufficient GALA balance. Available: ${formatAmount(latestBalances.gala)} GALA`;
        renderTui(
          latestBalances,
          latestPrices,
          latestUsdPrices,
          latestPnl,
          lastBalanceError,
          lastPriceError,
          lastUsdError,
          lastCommandMessage,
          swapInProgress
        );
        return;
      }

      if (swapInProgress) {
        lastCommandMessage = 'Swap already in progress. Please wait...';
        renderTui(
          latestBalances,
          latestPrices,
          latestUsdPrices,
          latestPnl,
          lastBalanceError,
          lastPriceError,
          lastUsdError,
          lastCommandMessage,
          swapInProgress
        );
        return;
      }

      swapInProgress = true;
      renderTui(
        latestBalances,
        latestPrices,
        latestUsdPrices,
        latestPnl,
        lastBalanceError,
        lastPriceError,
        lastUsdError,
        'Submitting DEX swap...',
        swapInProgress
      );

      try {
        const submission = await submitDexBuySwap(gSwap, galaAddress, dexAmount);
        const txHash = (submission.receipt as any)?.transactionHash ?? (submission.receipt as any)?.txId ?? 'unknown';
        lastCommandMessage = `DEX swap confirmed. Tx: ${txHash}`;
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastCommandMessage = `DEX swap failed: ${message}`;
      } finally {
        swapInProgress = false;
        renderTui(
          latestBalances,
          latestPrices,
          latestUsdPrices,
          latestPnl,
          lastBalanceError,
          lastPriceError,
          lastUsdError,
          lastCommandMessage,
          swapInProgress
        );
      }

      return;
    }

    if (command !== 'start' && command !== 'stop') {
      lastCommandMessage = `Unknown command: ${command}`;
      renderTui(
        latestBalances,
        latestPrices,
        latestUsdPrices,
        latestPnl,
        lastBalanceError,
        lastPriceError,
        lastUsdError,
        lastCommandMessage,
        swapInProgress
      );
      return;
    }

    if (swapInProgress) {
      lastCommandMessage = 'Swap already in progress. Please wait...';
      renderTui(
        latestBalances,
        latestPrices,
        latestUsdPrices,
        latestPnl,
        lastBalanceError,
        lastPriceError,
        lastUsdError,
        lastCommandMessage,
        swapInProgress
      );
      return;
    }

    swapInProgress = true;
    renderTui(
      latestBalances,
      latestPrices,
      latestUsdPrices,
      latestPnl,
      lastBalanceError,
      lastPriceError,
      lastUsdError,
      'Processing swap...',
      swapInProgress
    );

    const tokenIn = command === 'start' ? GALA_TOKEN : WBTC_TOKEN;
    const tokenOut = command === 'start' ? WBTC_TOKEN : GALA_TOKEN;
    const inputSymbol = command === 'start' ? 'GALA' : 'GWBTC';
    const outputSymbol = command === 'start' ? 'GWBTC' : 'GALA';

    const amount = command === 'start' ? latestBalances.gala : latestBalances.wbtc;

    if (amount.lte(0)) {
      lastCommandMessage = `No ${inputSymbol} balance available to swap.`;
      swapInProgress = false;
      renderTui(
        latestBalances,
        latestPrices,
        latestUsdPrices,
        latestPnl,
        lastBalanceError,
        lastPriceError,
        lastUsdError,
        lastCommandMessage,
        swapInProgress
      );
      return;
    }

    try {
      const { amountOut, price } = await quoteSwap(gSwap, tokenIn, tokenOut, amount);
      const slipMultiplier = new BigNumber(1).minus(SLIPPAGE_DECIMAL);
      const minOut = amountOut.multipliedBy(slipMultiplier);

      const decimals = outputSymbol === 'GALA' || outputSymbol === 'GWBTC' ? 8 : 18;
      const minOutString = minOut.decimalPlaces(decimals, BigNumber.ROUND_FLOOR).toString();

      appendActivityLog('swap_submitted', {
        direction: command,
        amountIn: amount.toString(),
        tokenIn,
        tokenOut,
        minAmountOut: minOutString,
        feeTier: DEFAULT_FEE,
      });

      const pendingTx = await gSwap.swaps.swap(
        tokenIn,
        tokenOut,
        DEFAULT_FEE,
        {
          exactIn: amount.toString(),
          amountOutMinimum: minOutString,
        },
        galaAddress
      );

      lastCommandMessage = 'Swap submitted. Waiting for confirmation...';
      renderTui(
        latestBalances,
        latestPrices,
        latestUsdPrices,
        latestPnl,
        lastBalanceError,
        lastPriceError,
        lastUsdError,
        lastCommandMessage,
        swapInProgress
      );

      const receipt = await pendingTx.wait();

      const logEntry = {
        timestamp: new Date().toISOString(),
        direction: command,
        amountIn: amount.toString(),
        quotedAmountOut: amountOut.toString(),
        minAmountOut: minOutString,
        price: price.toString(),
        feeTier: DEFAULT_FEE,
        slippageBps: clampedSlippage,
        txId: (receipt as any)?.txId ?? null,
        transactionHash: (receipt as any)?.transactionHash ?? null,
        walletAddress: galaAddress,
      };
      fs.appendFile(LOG_PATH, JSON.stringify(logEntry) + '\n', (err) => {
        if (err) {
          console.error('Failed to write swap log:', err.message ?? err);
        }
      });

      appendActivityLog('swap_confirmed', {
        direction: command,
        amountIn: amount.toString(),
        quotedAmountOut: amountOut.toString(),
        minAmountOut: minOutString,
        transactionHash: (receipt as any)?.transactionHash ?? null,
        txId: (receipt as any)?.txId ?? null,
      });

      lastCommandMessage = `Swap confirmed. Tx: ${(receipt as any)?.transactionHash ?? (receipt as any)?.txId ?? 'unknown'}`;
      await refresh();
    } catch (error) {
      const baseErrorDetails: Record<string, unknown> = {
        direction: command,
        amountIn: amount.toString(),
        tokenIn,
        tokenOut,
      };

      if (error instanceof Error) {
        baseErrorDetails.message = error.message;
        if (error.stack) {
          baseErrorDetails.stack = error.stack;
        }
      } else {
        baseErrorDetails.message = String(error);
      }

      if (typeof (error as any)?.code === 'string') {
        baseErrorDetails.code = (error as any).code;
      }

      if (typeof (error as any)?.response === 'object') {
        baseErrorDetails.response = {
          status: (error as any).response?.status,
          data: (error as any).response?.data,
        };
      }

      appendActivityLog('swap_failed', baseErrorDetails);

      lastCommandMessage = `Swap failed: ${error instanceof Error ? error.message : String(error)}`;
      await refresh();
    } finally {
      swapInProgress = false;
      renderTui(
        latestBalances,
        latestPrices,
        latestUsdPrices,
        latestPnl,
        lastBalanceError,
        lastPriceError,
        lastUsdError,
        lastCommandMessage,
        swapInProgress
      );
    }
  };

  rl.on('line', (line) => {
    handleCommand(line).catch((error) => {
      console.error('Command error:', error instanceof Error ? error.message : error);
    });
  });

  const cleanup = () => {
    clearInterval(interval);
    rl.close();
    if (GSwap.events.eventSocketConnected()) {
      GSwap.events.disconnectEventSocket();
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
