let cachedStops = null;
let cachedAt = 0;

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RESULTS = 3;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

function parseStop(feature) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  const lon = Array.isArray(coordinates) ? Number(coordinates[0]) : NaN;
  const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : NaN;

  return {
    id:
      feature?.id ||
      feature?.gtfs_id ||
      feature?.stop_id ||
      properties?.id ||
      properties?.gtfs_id ||
      properties?.stop_id,
    name:
      feature?.name ||
      feature?.stop_name ||
      properties?.name ||
      properties?.stop_name,
    lat,
    lon
  };
}

async function loadAllStops() {
  const now = Date.now();
  if (cachedStops && now - cachedAt < CACHE_TTL_MS) {
    return cachedStops;
  }

  const params = new URLSearchParams({
    limit: "10000"
  });

  const response = await fetch("https://api.golemio.cz/v2/gtfs/stops?" + params.toString(), {
    headers: {
      "X-Access-Token": process.env.GOLEMIO_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Stops catalog lookup failed: " + errorText);
  }

  const data = await response.json();
  const rawStops =
    data?.features ||
    data?.data?.features ||
    data?.stops ||
    [];

  cachedStops = rawStops
    .map(parseStop)
    .filter(
      (stop) =>
        stop.id &&
        stop.name &&
        Number.isFinite(stop.lat) &&
        Number.isFinite(stop.lon)
    );
  cachedAt = now;

  return cachedStops;
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const limit = Number(req.query.limit || DEFAULT_RESULTS);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "Missing or invalid lat/lon" });
    }

    if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    const allStops = await loadAllStops();
    const uniqueById = new Map();

    for (const stop of allStops) {
      if (!uniqueById.has(stop.id)) {
        uniqueById.set(stop.id, {
          id: stop.id,
          name: stop.name,
          distance: distanceInMeters(lat, lon, stop.lat, stop.lon)
        });
      }
    }

    const stops = Array.from(uniqueById.values())
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return res.status(200).json(stops);
  } catch (e) {
    console.error("STOPS ERROR:", e);
    return res.status(500).json({ error: "Stops failed", details: e.message });
  }
}
