# triply

Minimalistic app for viewing public transport departures from Prague stops using Golemio API data.

## Features

- 🔍 **Stop Search** - Search for Prague transport stops with real-time autocomplete and accent-insensitive matching
- � **Proximity Search** - Find stops near your location with an animated loading state while geolocation and lookup are running
- 🚌 **Live Departures** - View upcoming departures for selected stops, including configurable number of shown trips (1-40)
- 🗺️ **Live Vehicle Map** - Display real-time vehicle positions for currently shown departures directly on the map
- ♿❄️ **Vehicle Amenities** - Show low-floor and air-conditioned indicators when available in feed data
- ⏱️ **Delay Normalization** - Show delays in minutes consistently across departures and map popups
- 🚏 **Last Stop Details** - Show vehicle last stop name in map popup (with fallback resolution from stop ID)
- 🔄 **Auto Refresh** - Refresh vehicle positions on map every 5 seconds while the stop context is active
- ⚡ **Smart Caching** - Optimized performance with intelligent caching for stops and queries
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
- `limit` (number, optional) - Maximum departures per stop (1-40, default: 10)

**Example:**
```
GET /api/departures?stopId=U5080,U5081&limit=5
```

### `/api/vehicle-positions`
Get real-time vehicle positions for one or more trip IDs.

**Query Parameters:**
- `tripIds` (string) - Trip ID(s), comma-separated (up to 20)

**Example:**
```
GET /api/vehicle-positions?tripIds=12345,67890
```

### `/api/search`
Search and rank transport stops by stop name and related metadata.

**Query Parameters:**
- `name` (string) - Search query used for stop lookup

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

1. **Stop Search** - User enters a stop name and the backend normalizes text (lowercase + accent removal) for robust matching
2. **Proximity Lookup** - App resolves nearby stops from geolocation and ranks them by Haversine distance
3. **Departures** - Real-time departure board data are fetched for selected stop IDs with a user-defined limit
4. **Vehicle Positions** - For visible departures, app fetches live vehicle positions by trip ID and renders them on the map
5. **Map Context** - Selected stop, route chips, delay in minutes, amenities, and last-stop details are shown in vehicle popups
6. **Auto Refresh** - Vehicle positions refresh every 5 seconds to keep map data current
7. **Caching & Grouping** - Stop catalogs and query results are cached and grouped for faster UX

## License

MIT
