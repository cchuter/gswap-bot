# GSwap SDK Integration with GALA Price Comparison

A TypeScript application that integrates with the GSwap SDK to perform token swaps and compare GALA prices with CoinGecko.

## Features

- 🔐 **Secure Private Key Management** - Encrypted private key storage with password protection
- 💱 **GSwap Integration** - Direct integration with GSwap SDK for token swaps
- 📊 **Price Comparison** - Real-time price comparison between GSwap and CoinGecko for GALA
- 💰 **Arbitrage Detection** - Identifies potential arbitrage opportunities
- 🔍 **Quote Analysis** - Detailed GALA/GWETH quote analysis with USD pricing comparisons

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Gala Transfer Code (for private key decryption)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gswap
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your values
PRIVATE_KEY_ENCRYPTED=your-encrypted-private-key
WALLET_ADDRESS=your-wallet-address
```

## Usage

### 1. Decrypt Your Private Key

First, decrypt your encrypted private key:

```bash
npm run decrypt
```

Enter your Gala Transfer Code when prompted. The utility will:
- Decrypt your private key using XOR encryption
- Test multiple key candidates automatically
- Output the working private key for your `.env` file

### 2. Run Price Analysis

Get current GALA price analysis and comparison:

```bash
npm start
```

This will:
- Get a quote for swapping 10 GALA to GWETH
- Fetch current GALA and ETH prices from CoinGecko
- Compare GSwap vs CoinGecko prices
- Show arbitrage opportunities if difference > 10%
- Display implied USD-per-GALA pricing from both sources

### 3. Development Mode

Run in watch mode for development:

```bash
npm run dev
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PRIVATE_KEY_ENCRYPTED` | Your encrypted private key (base64) | Yes |
| `WALLET_ADDRESS` | Your wallet address | Yes |
| `PRIVATE_KEY` | Decrypted private key (set by decrypt utility) | Yes |

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run price analysis and comparison |
| `npm run dev` | Run in development mode with auto-restart |
| `npm run decrypt` | Decrypt private key utility |
| `npm run build` | Build TypeScript to JavaScript |

## Features Explained

### Private Key Security
- Private keys are encrypted using XOR encryption
- Password-protected decryption process
- Automatic key validation and testing

### Price Comparison
- Real-time GALA price from GSwap
- CoinGecko API integration for market price
- Percentage difference calculation
- Arbitrage opportunity detection

### Quote Analysis
- Calculates implied USD price per GALA from GSwap GALA->GWETH quotes
- Uses CoinGecko GALA and ETH data as the market reference
- Reports the percentage difference between implied and market prices
- Logs swap iterations and highlights notable movements

## API Endpoints Used

- **GSwap SDK**: For token quotes and swaps
- **CoinGecko API**: For market price data
  - Endpoint: `https://api.coingecko.com/api/v3/simple/price`
  - Parameters: `ids=ethereum,gala&vs_currencies=usd`

## Security Notes

- Never commit your `.env` file to version control
- The `.gitignore` file excludes sensitive files
- Private keys are encrypted and require password for decryption
- All API calls use timeouts to prevent hanging

## Troubleshooting

### Common Issues

1. **"No PRIVATE_KEY_ENCRYPTED found"**
   - Add your encrypted private key to `.env` file

2. **"Failed to decode base64"**
   - Ensure your encrypted key is properly base64 encoded

3. **"No working private key found"**
   - Check your Gala Transfer Code
   - Ensure the encrypted key is correct

4. **CoinGecko API errors**
   - Network connectivity issues
   - API rate limiting (free tier)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Check the troubleshooting section
- Review the CoinGecko API documentation
- Check GSwap SDK documentation 