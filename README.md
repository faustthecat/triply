# triply

Minimalistic app for viewing public transport departures from Prague stops using Golemio API data.

## Features

- 🔍 **Stop Search** - Search for Prague transport stops with real-time autocomplete and accent-insensitive matching
- 🚌 **Live Departures** - View upcoming departures for selected stops
- 📍 **Proximity Search** - Find stops near your location using distance calculations
- ⚡ **Smart Caching** - Optimized performance with intelligent caching for stops and queries
- 🗺️ **Modern UI** - Clean, minimal interface with a gradient design and smooth interactions
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile devices

## Tech Stack

- **Backend**: Node.js with Vercel Serverless Functions
- **Frontend**: Vanilla JavaScript with Leaflet.js for maps
- **Data Source**: [Golemio API](https://golemio.cz/) - Prague public transport data
- **Styling**: CSS with custom design tokens

## API Endpoints

### `/api/stops`
Search for transport stops in Prague.

**Query Parameters:**
- `query` (string) - Search query (stop name, location, etc.)
- `lat` (number, optional) - Latitude for proximity-based results
- `lon` (number, optional) - Longitude for proximity-based results
- `limit` (number, optional) - Maximum results (default: 3)

**Example:**
```
GET /api/stops?query=Náměstí&lat=50.08&lon=14.44
```

### `/api/departures`
Get upcoming departures from stops.

**Query Parameters:**
- `stopId` (string) - Stop ID(s), comma-separated for multiple stops
- `limit` (number, optional) - Maximum departures per stop (default: 10)

**Example:**
```
GET /api/departures?stopId=U5080,U5081
```

### `/api/search`
Advanced search with filtering and sorting capabilities.

**Query Parameters:**
- `query` (string) - Search query
- `lat` (number, optional) - User latitude for distance sorting
- `lon` (number, optional) - User longitude for distance sorting

## Getting Started

### Prerequisites
- Node.js 14+
- Golemio API key ([free registration](https://golemio.cz/))

### Installation

1. Clone the repository
2. Set up environment variables:
   ```
   GOLEMIO_KEY=your_api_key_here
   ```
3. Deploy to Vercel or run locally with Vercel CLI

### Local Development

```bash
# Install Vercel CLI
npm install -g vercel

# Run locally
vercel dev
```

## How It Works

1. **Stop Search** - User enters a search query that gets normalized (lowercase, accent removal) for matching
2. **Caching** - Stop data is cached for 5 minutes to reduce API calls
3. **Proximity** - Distances are calculated using the Haversine formula
4. **Departures** - Real-time departure data fetched from Golemio API
5. **Smart Grouping** - Stops with parent stations are grouped for better UX

## License

MIT
