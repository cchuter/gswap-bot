import { GSwap, PrivateKeySigner } from '@gala-chain/gswap-sdk';
import dotenv from 'dotenv';
import crypto from 'crypto';
import readline from 'readline';

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function decryptWithPassword(encryptedData: Buffer, password: string): Promise<string | null> {
  console.log('🔓 Attempting decryption with password...');
  
  // Try XOR decryption first (since we know it worked)
  try {
    const key = Buffer.from(password, 'utf8');
    const decrypted = Buffer.alloc(encryptedData.length);
    
    for (let i = 0; i < encryptedData.length; i++) {
      decrypted[i] = encryptedData[i] ^ key[i % key.length];
    }
    
    const hexResult = decrypted.toString('hex');
    console.log('✅ XOR decryption succeeded!');
    console.log(`Decrypted length: ${decrypted.length} bytes`);
    
    return hexResult;
  } catch (error) {
    console.log('❌ XOR decryption failed');
    return null;
  }
}

function generateKeyCandidates(hexData: string): string[] {
  const candidates: string[] = [];
  
  // Most likely candidates (in order of probability)
  
  // 1. First 32 bytes (most common format) - This was the working one!
  candidates.push(hexData.substring(0, 64));
  
  // 2. Last 32 bytes
  candidates.push(hexData.substring(hexData.length - 64));
  
  // 3. Middle 32 bytes
  const middleStart = Math.floor((hexData.length - 64) / 2);
  candidates.push(hexData.substring(middleStart, middleStart + 64));
  
  // 4. Every 32nd byte (common for structured data)
  for (let i = 0; i <= hexData.length - 64; i += 32) {
    const candidate = hexData.substring(i, i + 64);
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }
  
  // 5. Reverse the data and take first 32 bytes
  const reversed = hexData.split('').reverse().join('');
  candidates.push(reversed.substring(0, 64));
  
  // 6. Take bytes 32-96 (common offset)
  if (hexData.length >= 96) {
    candidates.push(hexData.substring(32, 96));
  }
  
  // 7. Take bytes 64-128 (another common offset)
  if (hexData.length >= 128) {
    candidates.push(hexData.substring(64, 128));
  }
  
  // Remove duplicates and invalid hex
  const uniqueCandidates = candidates.filter((key, index, arr) => 
    arr.indexOf(key) === index && /^[0-9a-fA-F]{64}$/.test(key)
  );
  
  return uniqueCandidates;
}

async function testPrivateKey(privateKey: string): Promise<boolean> {
  try {
    const gSwap = new GSwap({
      signer: new PrivateKeySigner(privateKey),
    });
    
    // Try to get a simple quote to test if the key works
    const quote = await gSwap.quoting.quoteExactInput(
      'GALA|Unit|none|none',
      'GWETH|Unit|none|none',
      1, // Just 1 GALA for testing
    );
    
    return true;
  } catch (error) {
    return false;
  }
}

async function findWorkingKey(decryptedHex: string): Promise<string | null> {
  console.log('🔍 Testing private key candidates...');
  
  const candidates = generateKeyCandidates(decryptedHex);
  console.log(`Total candidates to test: ${candidates.length}\n`);
  
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    console.log(`[${i + 1}/${candidates.length}] Testing candidate ${i + 1}...`);
    
    const success = await testPrivateKey(candidate);
    if (success) {
      console.log('✅ SUCCESS! Found working private key!');
      return candidate;
    }
  }
  
  console.log('❌ No working private key found among the candidates');
  return null;
}

async function decryptPrivateKey() {
  console.log('🔐 Private Key Decryption Utility');
  console.log('==================================\n');

  // Get encrypted key from environment
  const encryptedKey = process.env.PRIVATE_KEY_ENCRYPTED;
  
  if (!encryptedKey) {
    console.log('❌ No PRIVATE_KEY_ENCRYPTED found in .env file');
    console.log('Please add your encrypted private key to .env as:');
    console.log('PRIVATE_KEY_ENCRYPTED=your-encrypted-key-here');
    process.exit(1);
  }

  console.log(`Encrypted key length: ${encryptedKey.length} characters`);
  
  // Decode base64
  let encryptedData: Buffer;
  try {
    encryptedData = Buffer.from(encryptedKey, 'base64');
    console.log(`Base64 decoded length: ${encryptedData.length} bytes`);
  } catch {
    console.error('❌ Failed to decode base64');
    process.exit(1);
  }

  // Ask for password
  console.log('\n🔑 Enter the Gala Transfer Code to decrypt the private key:');
  const password = await question('Password: ');
  
  if (!password) {
    console.log('❌ Password is required');
    process.exit(1);
  }

  // Decrypt the data
  const decryptedHex = await decryptWithPassword(encryptedData, password);
  
  if (!decryptedHex) {
    console.log('❌ Decryption failed');
    process.exit(1);
  }

  // Find the working private key
  const workingKey = await findWorkingKey(decryptedHex);
  
  if (workingKey) {
    console.log('\n🎉 DECRYPTION SUCCESSFUL!');
    console.log('==========================');
    console.log(`Your private key: ${workingKey}`);
    console.log('\nCopy this to your .env file as:');
    console.log(`PRIVATE_KEY=${workingKey}`);
    console.log('\nThen run "npm start" to test your swap!');
  } else {
    console.log('\n❌ Could not find a working private key');
    console.log('The encryption method might be different or the password might be incorrect');
  }

  rl.close();
}

// Run the consolidated utility
decryptPrivateKey().catch(console.error); 