import axios from 'axios';
import BigNumber from 'bignumber.js';
import { config as loadEnv } from 'dotenv';
import { FeeAuthorizationDto } from '@gala-chain/api';
import { SigningKey } from 'ethers';

loadEnv();

const { PRIVATE_KEY, WALLET_ADDRESS, GALA_API_BASE, GALA_FEE_CHANNEL } = process.env;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function normaliseAmount(value: BigNumber): string {
  const asString = value.toFixed();
  return asString.includes('.') ? asString.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : asString;
}

async function main() {
  const amountArg = process.argv[2] ?? '1';
  const amount = new BigNumber(amountArg);

  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error('Fee amount must be a positive number');
  }

  const privateKey = requireEnv(PRIVATE_KEY, 'PRIVATE_KEY');
  const authority = requireEnv(WALLET_ADDRESS, 'WALLET_ADDRESS');
  const baseUrl = GALA_API_BASE ?? 'https://api-galaswap.gala.com';
  const channel = GALA_FEE_CHANNEL ?? 'asset';

  const pkHex = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const signingKey = new SigningKey(pkHex);
  const signerPublicKey = Buffer.from(signingKey.compressedPublicKey.slice(2), 'hex').toString('base64');

  const dto = new FeeAuthorizationDto();
  dto.uniqueKey = `galaswap-operation-${Date.now()}`;
  dto.authority = authority;
  dto.quantity = amount;
  dto.signerPublicKey = signerPublicKey;
  dto.sign(privateKey);

  const payload = {
    uniqueKey: dto.uniqueKey,
    authority: dto.authority,
    quantity: normaliseAmount(amount),
    signerPublicKey,
    signature: dto.signature
  };

  const endpoint = `${baseUrl}/v1/channels/${channel}/AuthorizeFee`;

  const response = await axios.post(endpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Wallet-Address': authority
    }
  });

  console.log(JSON.stringify(response.data, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
