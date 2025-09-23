import { GSwap, PrivateKeySigner } from '@gala-chain/gswap-sdk';
import axios from 'axios';
import { config as loadEnv } from 'dotenv';

loadEnv();

const { PRIVATE_KEY, WALLET_ADDRESS } = process.env;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

async function priceInUsd(symbol: string): Promise<number | null> {
  const envKey = `COINGECKO_${symbol.toUpperCase()}_ID`;
  const overrideId = process.env[envKey];

  const defaultMap: Record<string, string> = {
    GALA: 'gala',
    GWETH: 'ethereum',
    GWBTC: 'bitcoin',
    WETH: 'ethereum',
    WBTC: 'wrapped-bitcoin'
  };

  const coinId = overrideId ?? defaultMap[symbol.toUpperCase()];

  if (!coinId) {
    return null;
  }

  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: coinId,
        vs_currencies: 'usd'
      },
      timeout: 10_000
    });

    const usd = response.data?.[coinId]?.usd;
    return typeof usd === 'number' ? usd : null;
  } catch (error) {
    console.error(`⚠️  Failed to fetch USD price for ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    throw new Error('Usage: npm run quote -- <amount> [givingToken] [receivingToken]');
  }

  const [amountArg, givingTokenArg, receivingTokenArg] = args;
  const amount = Number(amountArg.replace(/_/g, '')); // allow 1_000 style format

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Quoted amount must be a positive number');
  }

  const givingToken = givingTokenArg ?? process.env.GALA_QUOTE_GIVING ?? 'GALA|Unit|none|none';
  const receivingToken = receivingTokenArg ?? process.env.GALA_QUOTE_RECEIVING ?? 'GWBTC|Unit|none|none';

  const privateKey = requireEnv(PRIVATE_KEY, 'PRIVATE_KEY');
  requireEnv(WALLET_ADDRESS, 'WALLET_ADDRESS');

  const gSwap = new GSwap({
    signer: new PrivateKeySigner(privateKey),
  });

  const givingSymbol = givingToken.split('|')[0];
  const receivingSymbol = receivingToken.split('|')[0];

  console.log(`🔍 Quoting ${amount} ${givingSymbol} → ${receivingSymbol}`);

  const quote = await gSwap.quoting.quoteExactInput(givingToken, receivingToken, amount);

  const outAmount = quote.outTokenAmount.toNumber();
  const priceImpact = quote.priceImpact?.toString() ?? 'n/a';
  const feeTier = quote.feeTier?.toString() ?? 'default';

  const [givingUsd, receivingUsd] = await Promise.all([
    priceInUsd(givingSymbol),
    priceInUsd(receivingSymbol)
  ]);

  const inputUsd = givingUsd !== null ? givingUsd * amount : null;
  const outputUsd = receivingUsd !== null ? receivingUsd * outAmount : null;

  console.log('-------------------------------------');
  console.log(`Input Amount : ${amount} ${givingSymbol}${inputUsd !== null ? ` (~$${inputUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})` : ''}`);
  console.log(`Output Amount: ${outAmount} ${receivingSymbol}${outputUsd !== null ? ` (~$${outputUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})` : ''}`);
  console.log(`Price Impact : ${priceImpact}`);
  console.log(`Fee Tier     : ${feeTier}`);
  console.log(`Quote ID     : ${quote.quoteId ?? 'n/a'}`);
  console.log('-------------------------------------');

  if (inputUsd === null || outputUsd === null) {
    console.log('ℹ️  Unable to compute USD value for one or both tokens. Configure COINGECKO_<SYMBOL>_ID or extend the script mapping.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
