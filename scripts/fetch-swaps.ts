import axios from 'axios';
import BigNumber from 'bignumber.js';

interface ExplorePool {
  poolName: string;
  token0: string;
  token1: string;
  token0Price: string;
  token1Price: string;
  fee: string;
  token0Tvl: number;
  token1Tvl: number;
  tvl: number;
  volume1d: number;
  volume30d: number;
}

interface ExplorePoolsResponse {
  status: number;
  error: boolean;
  message: string;
  data: {
    pools: ExplorePool[];
    count: number;
  };
}

const BASE_SYMBOL = (process.env.GALA_POOL_BASE ?? 'GALA').toUpperCase();
const EXPLORE_BASE = process.env.GALA_EXPLORE_API_BASE ?? 'https://dex-backend-prod1.defi.gala.com';
const PAGE_LIMIT = (() => {
  const raw = Number(process.env.GALA_POOL_PAGE_LIMIT ?? '20');
  if (Number.isNaN(raw) || raw <= 0) return 20;
  return Math.min(raw, 20);
})();

function formatNumber(value: string | number, decimalsForLarge = 2, decimalsForSmall = 6): string {
  try {
    const bn = new BigNumber(value);
    if (!bn.isFinite()) return String(value);
    if (bn.isZero()) return '0';
    if (bn.abs().gte(1)) {
      return bn.toFormat(decimalsForLarge);
    }
    return bn.toFormat(decimalsForSmall);
  } catch {
    return String(value);
  }
}

function formatUsd(value: number): string {
  return `$${formatNumber(value, 2, 4)}`;
}

function formatFee(value: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toString();
}

async function fetchAllPools(): Promise<ExplorePool[]> {
  const pools: ExplorePool[] = [];
  let page = 1;
  let totalCount = Infinity;

  while (pools.length < totalCount) {
    const { data } = await axios.get<ExplorePoolsResponse>(`${EXPLORE_BASE}/explore/pools`, {
      params: {
        limit: PAGE_LIMIT,
        page,
      },
      headers: {
        Accept: 'application/json',
      },
      timeout: 10_000,
    });

    const pagePools = data?.data?.pools ?? [];
    if (pagePools.length === 0) {
      break;
    }

    pools.push(...pagePools);
    totalCount = data?.data?.count ?? pools.length;
    page += 1;
  }

  return pools;
}

function isGalaPool(pool: ExplorePool): boolean {
  const name = pool.poolName.toUpperCase();
  return name.startsWith(`${BASE_SYMBOL}/`) || name.endsWith(`/${BASE_SYMBOL}`);
}

function displayPool(pool: ExplorePool): void {
  console.log(`\n${pool.poolName} (fee ${formatFee(pool.fee)}%)`);
  console.log(`  token0Price: ${formatNumber(pool.token0Price, 4, 8)} (${pool.token0})`);
  console.log(`  token1Price: ${formatNumber(pool.token1Price, 4, 8)} (${pool.token1})`);
  console.log(`  TVL: ${formatUsd(pool.tvl)} | 24h Volume: ${formatUsd(pool.volume1d)}`);
  console.log(`  token0 TVL: ${formatNumber(pool.token0Tvl, 4, 6)} ${pool.token0}`);
  console.log(`  token1 TVL: ${formatNumber(pool.token1Tvl, 4, 6)} ${pool.token1}`);
}

async function main(): Promise<void> {
  console.log(`Fetching GALA pools from ${EXPLORE_BASE} (base symbol: ${BASE_SYMBOL})`);

  const pools = await fetchAllPools();
  const galaPools = pools.filter(isGalaPool);

  if (galaPools.length === 0) {
    console.log('No pools found for the specified base token.');
    return;
  }

  galaPools
    .sort((a, b) => new BigNumber(b.tvl).minus(a.tvl).toNumber())
    .forEach(displayPool);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
