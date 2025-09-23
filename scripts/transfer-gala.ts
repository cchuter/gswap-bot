import axios from 'axios';
import { config as loadEnv } from 'dotenv';
import BigNumber from 'bignumber.js';
import { TransferTokenDto, TokenInstanceKey, TokenClassKey } from '@gala-chain/api';

loadEnv();

const { PRIVATE_KEY, WALLET_ADDRESS, TRANSFER_RECIPIENT, GALA_API_BASE } = process.env;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

async function main() {
  const amountArg = process.argv[2];

  if (!amountArg) {
    throw new Error('Usage: ts-node scripts/transfer-gala.ts <amount-in-gala>');
  }

  const amount = new BigNumber(amountArg);

  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error('Amount must be a positive number');
  }

  const privateKey = requireEnv(PRIVATE_KEY, 'PRIVATE_KEY');
  const fromAddress = requireEnv(WALLET_ADDRESS, 'WALLET_ADDRESS');
  const toAddress = requireEnv(TRANSFER_RECIPIENT, 'TRANSFER_RECIPIENT');

  const tokenClass = new TokenClassKey();
  tokenClass.collection = 'GALA';
  tokenClass.category = 'Unit';
  tokenClass.type = 'none';
  tokenClass.additionalKey = 'none';

  const dto = new TransferTokenDto();
  dto.uniqueKey = `galaswap-operation-${Date.now()}`;
  dto.from = fromAddress;
  dto.to = toAddress;
  dto.tokenInstance = TokenInstanceKey.fungibleKey(tokenClass);
  dto.quantity = amount;
  dto.sign(privateKey);

  const payload = {
    uniqueKey: dto.uniqueKey,
    from: dto.from,
    to: dto.to,
    tokenInstance: {
      collection: dto.tokenInstance.collection,
      category: dto.tokenInstance.category,
      type: dto.tokenInstance.type,
      additionalKey: dto.tokenInstance.additionalKey,
      instance: dto.tokenInstance.instance.toString(10)
    },
    quantity: dto.quantity.toString(10),
    signature: dto.signature
  };

  const baseUrl = GALA_API_BASE ?? 'https://api-galaswap.gala.com';
  const endpoint = `${baseUrl}/galachain/api/asset/token-contract/TransferToken`;

  const response = await axios.post(endpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Wallet-Address': fromAddress
    }
  });

  console.log(JSON.stringify(response.data, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
