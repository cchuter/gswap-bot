import axios from 'axios';
import stringify from 'json-stringify-deterministic';
import elliptic from 'elliptic';
import jsSha3 from 'js-sha3';
import { SigningKey } from 'ethers';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv();

const ecSecp256k1 = new elliptic.ec('secp256k1');
const { keccak256 } = jsSha3;

const LOG_PATH = process.env.GALA_CONNECT_SWAP_LOG ?? process.env.GALA_SWAP_REQUEST_LOG ?? path.join(os.homedir(), 'galaconnect-swaps.log');

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
  const hashArrayBuffer = keccak256.arrayBuffer(stringToSign);
  const hashBuffer = Buffer.from(hashArrayBuffer);
  const signature = key.sign(hashBuffer, { canonical: true });
  const signatureString = Buffer.from(signature.toDER()).toString('base64');
  return { ...payload, signature: signatureString };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error('Usage: npm run request-swap -- <givingAmount> <receivingAmount> <givingToken> <receivingToken> [uses]');
    process.exit(1);
  }

  const [givingAmount, receivingAmount, givingToken, receivingToken, usesArg] = args;
  const uses = usesArg ?? '1';

  const privateKeyEnv = process.env.PRIVATE_KEY;
  const walletAddressEnv = process.env.WALLET_ADDRESS;
  if (!privateKeyEnv || !walletAddressEnv) {
    throw new Error('PRIVATE_KEY and WALLET_ADDRESS must be set in the environment');
  }

  const privateKey = normalisePrivateKey(privateKeyEnv);
  const walletAddress = resolveGalaAddress(walletAddressEnv);
  const baseUrl = cleanBaseUrl(process.env.GALA_API_BASE ?? 'https://api-galaswap.gala.com');
  const endpoint = `${baseUrl}/v1/RequestTokenSwap`;

  const signingKey = new SigningKey(privateKey);
  const signerPublicKey = Buffer.from(signingKey.compressedPublicKey.slice(2), 'hex').toString('base64');

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

    console.log('Swap request submitted:');
    console.log(JSON.stringify(response.data, null, 2));

    const logEntry = {
      timestamp: new Date().toISOString(),
      endpoint,
      walletAddress,
      payload: body,
      response: response.data,
    };

    fs.appendFileSync(LOG_PATH, `${JSON.stringify(logEntry)}\n`);
    console.log(`Saved swap request log to ${LOG_PATH}`);
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
