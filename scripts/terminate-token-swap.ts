import axios from 'axios';
import stringify from 'json-stringify-deterministic';
import elliptic from 'elliptic';
import jsSha3 from 'js-sha3';
import { randomUUID } from 'crypto';
import { SigningKey } from 'ethers';
import { config as loadEnv } from 'dotenv';

loadEnv();

const ecSecp256k1 = new elliptic.ec('secp256k1');
const { keccak256 } = jsSha3;

function cleanBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
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

function resolveGalaAddress(address: string): string {
  if (address.includes('|')) {
    return address;
  }
  if (address.toLowerCase().startsWith('0x')) {
    return `eth|${address.slice(2)}`;
  }
  return address;
}

function signPayload<T extends Record<string, unknown>>(payload: T, privateKey: string): T & { signature: string } {
  const key = ecSecp256k1.keyFromPrivate(privateKey.replace(/^0x/, ''), 'hex');
  const dataToSign = { ...payload };
  delete (dataToSign as any).signature;

  const stringToSign = stringify(dataToSign);
  const hashBuffer = Buffer.from(keccak256.arrayBuffer(stringToSign));
  const signature = key.sign(hashBuffer, { canonical: true });
  const signatureString = Buffer.from(signature.toDER()).toString('base64');
  return { ...payload, signature: signatureString };
}

function decodeSwapRequestId(raw: string): string {
  if (!raw) {
    return raw;
  }

  if (raw.startsWith('base64:')) {
    return Buffer.from(raw.slice('base64:'.length), 'base64').toString('utf8');
  }

  if (raw.includes('\\u')) {
    return raw.replace(/\\u([0-9a-fA-F]{4})/g, (_match, group) => String.fromCharCode(parseInt(group, 16)));
  }

  return raw;
}

async function main(): Promise<void> {
  const rawArg = process.argv[2];

  if (!rawArg) {
    console.error('Usage: npm run terminate-swap -- <swapRequestId>');
    console.error('       (wrap the ID in quotes and escape backslashes, e.g. "\\u0000...")');
    process.exit(1);
  }

  const swapRequestId = decodeSwapRequestId(rawArg);

  const privateKeyEnv = process.env.PRIVATE_KEY;
  const walletAddressEnv = process.env.WALLET_ADDRESS;

  if (!privateKeyEnv || !walletAddressEnv) {
    throw new Error('PRIVATE_KEY and WALLET_ADDRESS must be set in the environment');
  }

  const privateKey = normalisePrivateKey(privateKeyEnv);
  const walletAddress = resolveGalaAddress(walletAddressEnv);
  const baseUrl = cleanBaseUrl(process.env.GALA_API_BASE ?? 'https://api-galaswap.gala.com');
  const endpoint = `${baseUrl}/v1/TerminateTokenSwap`;

  const signingKey = new SigningKey(privateKey);
  const signerPublicKey = Buffer.from(signingKey.compressedPublicKey.slice(2), 'hex').toString('base64');

  const body = {
    swapRequestId,
    uniqueKey: `galaconnect-operation-${randomUUID()}`,
    signerPublicKey,
  };

  const signedBody = signPayload(body, privateKey);

  try {
    const response = await axios.post(endpoint, signedBody, {
      headers: {
        'Content-Type': 'application/json',
        'X-Wallet-Address': walletAddress,
      },
    });

    console.log('Terminate swap submitted:');
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
