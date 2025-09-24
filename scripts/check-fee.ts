import axios from 'axios';
import { config as loadEnv } from 'dotenv';

loadEnv();

function cleanBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function parseTokenClass(token: string) {
  const [collection, category, type, additionalKey] = token.split('|');
  if (!collection || !category || !type || !additionalKey) {
    throw new Error(`Invalid token class key: ${token}`);
  }
  return { collection, category, type, additionalKey, instance: '0' };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error('Usage: npm run check-fee -- <givingAmount> <receivingAmount> <givingToken> <receivingToken> [uses]');
    process.exit(1);
  }

  const [givingAmount, receivingAmount, givingToken, receivingToken, usesArg] = args;
  const uses = usesArg ?? '1';

  const baseUrl = cleanBaseUrl(process.env.GALA_API_BASE ?? 'https://api-galaswap.gala.com');
  const endpoint = `${baseUrl}/v1/RequestTokenSwap/fee`;
  const wallet = process.env.WALLET_ADDRESS;

  const body = {
    offered: [
      {
        quantity: givingAmount,
        tokenInstance: parseTokenClass(givingToken),
      },
    ],
    wanted: [
      {
        quantity: receivingAmount,
        tokenInstance: parseTokenClass(receivingToken),
      },
    ],
    uses,
  };

  try {
    const response = await axios.post(endpoint, body, {
      headers: {
        'Content-Type': 'application/json',
        ...(wallet ? { 'X-Wallet-Address': wallet } : {}),
      },
    });

    console.log('Fee response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    if ((error as any)?.response) {
      const status = (error as any).response.status;
      const statusText = (error as any).response.statusText;
      const data = (error as any).response.data;
      console.error(`Request failed with status ${status}${statusText ? ` (${statusText})` : ''}.`);
      if (data) {
        console.error('Response body:', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
      }
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}

main();
