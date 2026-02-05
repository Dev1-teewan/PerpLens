# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PnL Dashboard (PerpLens) - A real-time funding PnL dashboard for tracking Drift Protocol perpetual futures strategies on Solana. Tracks cash & carry arbitrage positions by fetching funding payments and calculating notional values, ROI, and APY.

## Development Commands

```bash
npm run dev      # Full stack (Express + Vite) on port 5000
npm run build    # Production build
npm run check    # TypeScript type checking
```

## Architecture

### Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Data Fetching:** TanStack React Query with custom hooks
- **Charts:** Recharts
- **Backend (optional):** Express.js in `/server/`
- **Data Source:** Drift Protocol API (`https://data.api.drift.trade`)

### Key Data Flow

1. **Progressive Loading Strategy** (`src/hooks/use-strategies.ts`):
   - Fetches 7 days first → then 30 days in background
   - Extended timeframes (3M/6M/1Y) load sequentially after 30D completes
   - 12-month probe discovers data for addresses with no recent activity

2. **Caching System** (`src/services/cache-utils.ts`):
   - localStorage-based monthly cache: `drift:funding:{address}:{year}:{month}`
   - 1-minute TTL on price data to prevent excessive API calls
   - Deduplication by `txSig` + `txSigIndex`

3. **Price Enrichment**:
   - Fetches current prices from Drift candles API
   - Calculates: Notional Value = Token Amount × Current Price
   - ROI = Funding PnL / Notional Value × 100
   - APY = ROI × (365 / days_in_timeframe)

### Service Layer

| File | Purpose |
|------|---------|
| `src/services/drift-api.ts` | API calls to Drift Protocol |
| `src/services/drift-transformer.ts` | Transform API data to app schema |
| `src/services/cache-utils.ts` | localStorage cache management |

### Main Hook

`src/hooks/use-strategies.ts` (~950 lines) encapsulates all business logic: data fetching, caching, progressive loading, and price enrichment. Returns complex state including loading progress and timeframe availability.

### Drift API Endpoints Used

- `GET /user/{address}/fundingPayments` - Paginated funding history
- `GET /user/{address}/fundingPayments/{year}/{month}` - Monthly funding (cached)
- `GET /market/{symbol}/candles/1?limit=1` - Current price
- `GET /market/{symbol}/candles/D?limit=365` - Daily OHLC for heatmap

## TypeScript Configuration

- Strict mode enabled
- Path alias: `@/*` → `./src/*`
- JSX: react-jsx (automatic)

## Testing Notes

- Default account "main-account" uses mock data (`src/mock-strategy.ts`)
- Test wallet: `j7PHE3FBgHXFzNK2bQKtsUqBVGXaHfiNrR6JPi5wGBx`
- Supported timeframes: 24H, 7D, 30D, 3M, 6M, 1Y
