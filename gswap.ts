import { GSwap, PrivateKeySigner } from '@gala-chain/gswap-sdk';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Logging function
function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // Write to console
  console.log(message);
  
  // Write to file
  fs.appendFileSync('gswap.log', logMessage);
}

// Validate required environment variables
if (!process.env.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY environment variable is required');
}

if (!process.env.WALLET_ADDRESS) {
  throw new Error('WALLET_ADDRESS environment variable is required');
}

// Helper function to validate private key format without logging sensitive data
function validatePrivateKey(privateKey: string): void {
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(privateKey);
  const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(privateKey) && privateKey.length === 44;
  const isPrefixedHex = /^0x[0-9a-fA-F]{64}$/.test(privateKey);

  if (!(isHex64 || isBase64 || isPrefixedHex)) {
    throw new Error('PRIVATE_KEY must be a hex (64 chars), hex with 0x prefix, or base64-encoded value.');
  }
}

async function getCoinGeckoPrice(): Promise<{ ethPrice: number | null; galaPrice: number | null }> {
  try {
    // CoinGecko free API endpoint for both ETH and GALA prices in USD
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum,gala',
        vs_currencies: 'usd'
      },
      timeout: 10000 // 10 second timeout
    });
    
    const ethPrice = response.data.ethereum?.usd || null;
    const galaPrice = response.data.gala?.usd || null;
    
    return { ethPrice, galaPrice };
  } catch (error) {
    logToFile('❌ Failed to fetch CoinGecko prices: ' + (error instanceof Error ? error.message : 'Unknown error'));
    return { ethPrice: null, galaPrice: null };
  }
}

async function checkArbitrageOpportunity(): Promise<{ hasArb: boolean; galaPrice: number; referencePrice: number; percentage: number }> {
  try {
    const gSwap = new GSwap({
      signer: new PrivateKeySigner(process.env.PRIVATE_KEY!),
    });

    const GALA_SELLING_AMOUNT = 10; // Amount of GALA to sell

    // Quote how much GWETH you can get for 10 GALA
    const quote = await gSwap.quoting.quoteExactInput(
      'GALA|Unit|none|none', // Token to sell
      'GWETH|Unit|none|none', // Token to buy
      GALA_SELLING_AMOUNT,
    );

    // Get prices from CoinGecko
    const { ethPrice, galaPrice } = await getCoinGeckoPrice();
    
    if (!ethPrice || !galaPrice) {
      logToFile('❌ Could not fetch prices from CoinGecko');
      return { hasArb: false, galaPrice: 0, referencePrice: 0, percentage: 0 };
    }

    // Calculate the implied GALA price from the swap
    const gwethReceived = quote.outTokenAmount.toNumber();
    const galaSold = GALA_SELLING_AMOUNT;
    const impliedGalaPrice = (gwethReceived / galaSold) * ethPrice;
    
    // Use actual GALA price from CoinGecko as reference
    const referenceGalaPrice = galaPrice;
    
    const priceDifference = Math.abs(impliedGalaPrice - referenceGalaPrice);
    const percentageDifference = (priceDifference / referenceGalaPrice) * 100;
    
    return {
      hasArb: percentageDifference > 10,
      galaPrice: impliedGalaPrice,
      referencePrice: referenceGalaPrice,
      percentage: percentageDifference
    };
    
  } catch (error) {
    logToFile('Error checking arbitrage: ' + (error instanceof Error ? error.message : 'Unknown error'));
    return { hasArb: false, galaPrice: 0, referencePrice: 0, percentage: 0 };
  }
}

async function main() {
  try {
    logToFile('🚀 Starting GALA/GWETH Arbitrage Monitor');
    logToFile('==========================================');
    logToFile('Monitoring for >10% arbitrage opportunities...');
    logToFile('Checking every 60 seconds...');
    logToFile('Logging to gswap.log file...\n');
    
    // Validate private key format
    validatePrivateKey(process.env.PRIVATE_KEY!);
    
    let iteration = 1;
    
    while (true) {
      const timestamp = new Date().toLocaleTimeString();
      logToFile(`[${timestamp}] Iteration ${iteration} - Checking for arbitrage...`);
      
      const result = await checkArbitrageOpportunity();
      
      if (result.hasArb) {
        logToFile('\n🎯 ARBITRAGE OPPORTUNITY DETECTED!');
        logToFile('=====================================');
        logToFile(`💰 GSwap implied GALA price: $${result.galaPrice.toFixed(6)}`);
        logToFile(`📊 CoinGecko GALA price: $${result.referencePrice.toFixed(6)}`);
        logToFile(`📈 Price difference: ${result.percentage.toFixed(2)}%`);
        logToFile(`⏰ Detected at: ${timestamp}`);
        logToFile('💡 Consider executing the swap!');
        logToFile('=====================================\n');
      } else {
        logToFile(`✅ No significant arbitrage found (${result.percentage.toFixed(2)}% difference)`);
        logToFile(`   GSwap: $${result.galaPrice.toFixed(6)} | CoinGecko: $${result.referencePrice.toFixed(6)}`);
      }
      
      iteration++;
      
      // Wait 60 seconds before next check
      //logToFile('⏳ Waiting 60 seconds for next check...\n');
      await new Promise(resolve => setTimeout(resolve, 60000)); // 60 seconds
    }

  } catch (error) {
    logToFile('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}

// Run the main function
main();
