const MAX_LIMIT = 20;
const DEFAULT_RANGE = 1200;
const EARTH_RADIUS_METERS = 6371000;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstText(values, fallback = "") {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return fallback;
}

function parseItem(source) {
  const properties = source?.properties || {};
  const coordinates = source?.geometry?.coordinates;
  const locationCoordinates = source?.location?.coordinates;
  const lon = Array.isArray(coordinates)
    ? toFiniteNumber(coordinates[0])
    : Array.isArray(locationCoordinates)
      ? toFiniteNumber(locationCoordinates[0])
      : toFiniteNumber(
          source?.lon ??
            source?.lng ??
            source?.longitude ??
            properties?.lon ??
            properties?.lng ??
            properties?.longitude
        );
  const lat = Array.isArray(coordinates)
    ? toFiniteNumber(coordinates[1])
    : Array.isArray(locationCoordinates)
      ? toFiniteNumber(locationCoordinates[1])
      : toFiniteNumber(source?.lat ?? source?.latitude ?? properties?.lat ?? properties?.latitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    id: firstText([source?.id, properties?.id, properties?.station_id], "station"),
    name: firstText([
      source?.name,
      properties?.name,
      properties?.station_name,
      properties?.title,
      "Stanice sdilenych kol"
    ]),
    provider: firstText([
      source?.provider,
      properties?.provider,
      properties?.company_name,
      properties?.network,
      properties?.operator_name,
      properties?.operator
    ]),
    freeBikes: toFiniteNumber(
      source?.free_bikes ??
        properties?.free_bikes ??
        properties?.available_bikes ??
        properties?.bikes_available
    ),
    emptySlots: toFiniteNumber(
      source?.empty_slots ??
        properties?.empty_slots ??
        properties?.free_boxes ??
        properties?.available_docks ??
        properties?.docks_available
    ),
    capacity: toFiniteNumber(source?.capacity ?? properties?.capacity),
    lat,
    lon
  };
}

function normalizeResponseItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data?.features)) {
    return payload.data.features;
  }

  if (Array.isArray(payload?.features)) {
    return payload.features;
  }

  if (Array.isArray(payload?.stations)) {
    return payload.stations;
  }

  if (Array.isArray(payload?.data?.stations)) {
    return payload.data.stations;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
}

async function fetchFirstSuccessful(urls, headers) {
  const errors = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        errors.push(url + " -> " + response.status + " " + errorText);
        continue;
      }

      const payload = await response.json();
      return {
        url,
        payload
      };
    } catch (error) {
      errors.push(url + " -> " + String(error?.message || error));
    }
  }

  const details = errors.join(" | ");
  throw new Error("Shared bikes lookup failed. " + details);
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const limit = Number(req.query.limit || 6);
    const range = Number(req.query.range || DEFAULT_RANGE);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "Missing or invalid lat/lon" });
    }

    if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    if (!Number.isFinite(range) || range < 100 || range > 5000) {
      return res.status(400).json({ error: "Invalid range" });
    }

    const commonParams = new URLSearchParams({
      latlng: lat + "," + lon,
      range: String(Math.round(range)),
      limit: String(Math.round(limit))
    });

    const coordinateParams = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      range: String(Math.round(range)),
      limit: String(Math.round(limit))
    });

    const urlsToTry = [
      "https://api.golemio.cz/v2/vehiclesharing?" + commonParams.toString(),
      "https://api.golemio.cz/v2/vehiclesharing?" + coordinateParams.toString(),
      "https://api.golemio.cz/v2/sharedbikes?" + commonParams.toString(),
      "https://api.golemio.cz/v2/sharedbikes?" + coordinateParams.toString()
    ];

    const { payload, url } = await fetchFirstSuccessful(urlsToTry, {
      "X-Access-Token": process.env.GOLEMIO_KEY
    });
    const items = normalizeResponseItems(payload)
      .map(parseItem)
      .filter(Boolean)
      .map((item) => ({
        ...item,
        distance: distanceInMeters(lat, lon, item.lat, item.lon)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.round(limit));

    return res.status(200).json({
      items,
      total: items.length,
      source: url
    });
  } catch (error) {
    console.error("SHARED BIKES ERROR:", error);
    return res.status(500).json({
      error: "Shared bikes failed",
      details: String(error?.message || error)
    });
  }
}
