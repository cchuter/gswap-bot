import axios from 'axios';
import { FeeAuthorizationDto } from '@gala-chain/api';
import BigNumber from 'bignumber.js';
import { config as loadEnv } from 'dotenv';
import { SigningKey } from 'ethers';

loadEnv();

const { PRIVATE_KEY, WALLET_ADDRESS, GALA_API_BASE, GALA_FEE_CHANNEL } = process.env;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function resolveGalaAddress(address: string): string {
  if (address.includes('|')) {
    return address;
  }
  if (address.toLowerCase().startsWith('0x')) {
    return `eth|${address.slice(2)}`;
  }
  return address;
}

function normalisePrivateKey(privateKey: string): string {
  if (privateKey.startsWith('0x')) {
    return privateKey;
  }
  if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    return `0x${privateKey}`;
  }
  throw new Error('PRIVATE_KEY must be a 64 character hex string optionally prefixed with 0x');
}

function cleanBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function normaliseAmount(value: BigNumber): string {
  const asString = value.toFixed();
  return asString.includes('.')
    ? asString.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
    : asString;
}

async function main(): Promise<void> {
  const amountArg = process.argv[2];

  if (!amountArg) {
    throw new Error('Usage: npm run authorize-fee -- <amount>');
  }

  const amount = new BigNumber(amountArg);

  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error('Fee amount must be a positive number');
  }

  const privateKey = normalisePrivateKey(requireEnv(PRIVATE_KEY, 'PRIVATE_KEY'));
  const authority = resolveGalaAddress(requireEnv(WALLET_ADDRESS, 'WALLET_ADDRESS'));
  const baseUrl = cleanBaseUrl(GALA_API_BASE ?? 'https://api-galaswap.gala.com');
  const channel = GALA_FEE_CHANNEL ?? 'asset';
  const endpoint = `${baseUrl}/v1/channels/${channel}/AuthorizeFee`;

  const dto = new FeeAuthorizationDto();
  dto.uniqueKey = `galaconnect-operation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  dto.authority = authority;
  dto.quantity = amount;

  const signingKey = new SigningKey(privateKey);
  const signerPublicKey = Buffer.from(signingKey.compressedPublicKey.slice(2), 'hex').toString('base64');
  dto.signerPublicKey = signerPublicKey;
  dto.sign(privateKey);

  const payload = {
    uniqueKey: dto.uniqueKey,
    authority: dto.authority,
    quantity: normaliseAmount(amount),
    signerPublicKey,
    signature: dto.signature,
  };

  try {
    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Wallet-Address': authority,
      },
    });

    console.log('✅ Fee authorization submitted');
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
    } else if ((error as any)?.Error) {
      console.error('Chain response error:', (error as any).Error);
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
