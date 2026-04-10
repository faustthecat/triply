let cachedStops = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RESULTS = 3;
const STOPS_PAGE_SIZE = 5000;
const MAX_STOPS_PAGES = 12;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
  const fullName =
    feature?.name ||
    feature?.stop_name ||
    properties?.name ||
    properties?.stop_name ||
    "";
  const segments = String(fullName)
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const name = segments.length > 0 ? segments[segments.length - 1] : fullName;
  const subtitle = segments.length > 1 ? segments.slice(0, -1).join(", ") : "";

  return {
    id:
      feature?.id ||
      feature?.gtfs_id ||
      feature?.stop_id ||
      properties?.id ||
      properties?.gtfs_id ||
      properties?.stop_id ||
      "",
    name,
    fullName,
    subtitle,
    lat,
    lon,
    parentId:
      feature?.parent_station ||
      feature?.parentStation ||
      properties?.parent_station ||
      properties?.parentStation ||
      ""
  };
}

function sortStopIds(ids) {
  return Array.from(new Set(ids.filter(Boolean))).sort((a, b) => a.localeCompare(b, "cs"));
}

function groupStops(stops) {
  const groups = new Map();

  for (const stop of stops) {
    const groupKey =
      stop.parentId ||
      stop.fullName ||
      stop.name ||
      stop.id;

    if (!groupKey) {
      continue;
    }

    const normalizedGroupKey = normalizeText(groupKey);
    const existing = groups.get(normalizedGroupKey);

    if (!existing) {
      groups.set(normalizedGroupKey, {
        id: stop.id,
        ids: sortStopIds([stop.id]),
        name: stop.name,
        fullName: stop.fullName || stop.name || stop.id,
        subtitle: stop.subtitle || "",
        lat: stop.lat,
        lon: stop.lon,
        distance: Number.isFinite(stop.distance) ? stop.distance : null
      });
      continue;
    }

    existing.ids = sortStopIds(existing.ids.concat(stop.id));

    if (
      Number.isFinite(stop.distance) &&
      (!Number.isFinite(existing.distance) || stop.distance < existing.distance)
    ) {
      existing.distance = stop.distance;
      existing.id = stop.id || existing.id;
      existing.lat = stop.lat;
      existing.lon = stop.lon;
    }

    if ((!existing.fullName || existing.fullName.length > stop.fullName.length) && stop.fullName) {
      existing.fullName = stop.fullName;
    }

    if ((!existing.name || existing.name.length > stop.name.length) && stop.name) {
      existing.name = stop.name;
    }

    if ((!existing.subtitle || existing.subtitle.length > stop.subtitle.length) && stop.subtitle) {
      existing.subtitle = stop.subtitle;
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    id: group.ids[0] || group.id
  }));
}

function getFeatureStopId(feature) {
  return (
    feature?.id ||
    feature?.gtfs_id ||
    feature?.stop_id ||
    feature?.properties?.id ||
    feature?.properties?.gtfs_id ||
    feature?.properties?.stop_id ||
    ""
  );
}

async function loadAllStops() {
  const now = Date.now();
  if (cachedStops && now - cachedAt < CACHE_TTL_MS) {
    return cachedStops;
  }

  async function fetchStopsPage(extraParams) {
    const params = new URLSearchParams({
      limit: String(STOPS_PAGE_SIZE),
      ...extraParams
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
    return data?.features || data?.data?.features || data?.stops || [];
  }

  const rawStops = [];
  const seenPageSignatures = new Set();

  for (let index = 0; index < MAX_STOPS_PAGES; index += 1) {
    const pageStops = await fetchStopsPage({
      offset: String(index * STOPS_PAGE_SIZE)
    });

    if (!pageStops.length) {
      break;
    }

    const pageSignature = [
      getFeatureStopId(pageStops[0]),
      getFeatureStopId(pageStops[pageStops.length - 1]),
      pageStops.length
    ].join("|");

    if (seenPageSignatures.has(pageSignature)) {
      break;
    }

    seenPageSignatures.add(pageSignature);
    rawStops.push(...pageStops);

    if (pageStops.length < STOPS_PAGE_SIZE) {
      break;
    }
  }

  cachedStops = rawStops
    .map(parseStop)
    .filter(
      (stop) =>
        stop.id &&
        stop.fullName &&
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
    const nearbyStops = allStops.map((stop) => ({
      ...stop,
      distance: distanceInMeters(lat, lon, stop.lat, stop.lon)
    }));
    const stops = groupStops(nearbyStops)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return res.status(200).json(stops);
  } catch (e) {
    console.error("STOPS ERROR:", e);
    return res.status(500).json({ error: "Stops failed", details: e.message });
  }
}
