# PerpLens - Cash and Carry PnL Dashboard

A real-time funding PnL dashboard for tracking Drift Protocol perpetual futures strategies. Monitor your cash & carry arbitrage positions, visualize cumulative returns, and analyze per-market performance with live price data.

## Features

- **Real-time Funding PnL Tracking** - Fetches funding payment history from Drift Protocol API
- **Live Market Prices** - Current prices from Drift candles API with auto-calculated notional values
- **Multi-Timeframe Analysis** - Switch between 24H, 7D, and 30D views
- **Interactive Charts**
  - Cumulative PnL with split gradient (green above 0, red below)
  - Daily/Hourly PnL bar charts
  - Calendar heatmap view
- **Position Table with Sparklines**
  - Sorted by notional value (highest first)
  - Per-market trend sparklines
  - Expandable rows with detailed charts
- **Calculated Metrics**
  - Total Funding PnL
  - Annualized APY based on selected timeframe
  - Total Active Notional (USD)
- **Search History** - Recent wallet addresses saved locally with custom autocomplete
- **Progressive Loading** - Shows initial 7-day data quickly, then loads full 30-day history

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS, shadcn/ui components
- **Charts:** Recharts
- **Animations:** Framer Motion
- **Routing:** Wouter
- **Backend:** Express (optional, for API proxy)
- **Data Source:** [Drift Protocol Data API](https://data.api.drift.trade)

## Quick Start

```bash
# Install dependencies
npm install

# Run frontend only (recommended for development)
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Run with Backend

```bash
# Full stack: Express API + Vite on single port
npm run dev
```

Opens at [http://127.0.0.1:5000](http://127.0.0.1:5000).

## Usage

1. **Demo Mode** - The app loads with "main-account" showing mock data
2. **Load Real Data** - Enter a Solana wallet address that has Drift perpetual positions
3. **Select Timeframe** - Toggle between 24H, 7D, or 30D views
4. **Explore Positions** - Click on any row to expand and see detailed per-market charts
5. **Search History** - Previously searched addresses are saved and shown in dropdown

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components (button, card, table, etc.)
│   ├── MetricCard.tsx   # KPI metric display cards
│   ├── PnLCharts.tsx    # Cumulative, daily, and heatmap charts
│   ├── PositionsTable.tsx # Positions table with sparklines
│   └── Sparkline.tsx    # Mini trend chart component
├── hooks/
│   └── use-strategies.ts # Main data fetching hook with caching
├── pages/
│   └── Home.tsx         # Main dashboard page
├── services/
│   ├── drift-api.ts     # Drift API client (funding payments, candles)
│   ├── drift-transformer.ts # Transform API data to app schema
│   └── drift-types.ts   # Drift API response types
├── types/
│   └── schema.ts        # App data types (Strategy, Position, DailyMetric)
└── lib/
    └── utils.ts         # Utility functions

server/                  # Express backend (optional)
├── index.ts
├── routes.ts
└── data.ts
```

## Drift API Integration

### Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /user/{address}/fundingPayments` | Fetch paginated funding payment records |
| `GET /user/{address}/fundingPayments/{year}/{month}` | Historical data by month |
| `GET /market/{symbol}/candles/1?limit=1` | Current market price from latest candle |

### Data Flow

1. **Funding Payments** - Fetched progressively (7 days first, then up to 30 days)
2. **Price Enrichment** - Current prices fetched for all markets in positions
3. **Aggregation** - Records grouped by market and date for charts
4. **Calculations**
   - `Notional Value = Token Amount × Current Price`
   - `ROI = Funding PnL / Notional Value × 100`
   - `APY = ROI × (365 / days_in_timeframe)`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Full stack: Express + Vite on :5000 |
| `npm run dev:client` | Frontend only: Vite on :5173 |
| `npm run build` | Build for production |
| `npm run check` | TypeScript type check |

## Environment Variables

Create a `.env` file (optional):

```env
PORT=5000
HOST=127.0.0.1
```

## License

MIT
