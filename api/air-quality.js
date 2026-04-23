const MAX_LIMIT = 5;
const DEFAULT_RANGE = 4000;
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

function parseComponent(component) {
  const averaged = component?.averaged_time || {};
  const value = toFiniteNumber(averaged?.value ?? component?.value);
  const hours = toFiniteNumber(averaged?.averaged_hours ?? component?.averaged_hours);
  const type = String(component?.type || "").trim();

  if (!type || !Number.isFinite(value)) {
    return null;
  }

  return {
    type,
    value,
    averagedHours: Number.isFinite(hours) ? hours : null
  };
}

function parseStation(feature, originLat, originLon) {
  const lon = toFiniteNumber(feature?.geometry?.coordinates?.[0]);
  const lat = toFiniteNumber(feature?.geometry?.coordinates?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const properties = feature?.properties || {};
  const measurement = properties?.measurement || {};
  const index = toFiniteNumber(
    measurement?.AQ_hourly_index ?? measurement?.AQ_hourly_indx ?? measurement?.aq_hourly_index
  );
  const components = Array.isArray(measurement?.components)
    ? measurement.components.map(parseComponent).filter(Boolean).slice(0, 6)
    : [];

  return {
    id: String(properties?.id || "").trim(),
    name: String(properties?.name || "").trim(),
    district: String(properties?.district || "").trim(),
    updatedAt: String(properties?.updated_at || "").trim(),
    index: Number.isFinite(index) ? index : null,
    components,
    lat,
    lon,
    distance: distanceInMeters(originLat, originLon, lat, lon)
  };
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const limit = Number(req.query.limit || 1);
    const range = Number(req.query.range || DEFAULT_RANGE);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "Missing or invalid lat/lon" });
    }

    if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    if (!Number.isFinite(range) || range < 500 || range > 20000) {
      return res.status(400).json({ error: "Invalid range" });
    }

    const params = new URLSearchParams({
      latlng: lat + "," + lon,
      range: String(Math.round(range)),
      limit: String(Math.max(5, Math.round(limit * 3)))
    });

    const response = await fetch("https://api.golemio.cz/v2/airqualitystations?" + params.toString(), {
      headers: {
        "X-Access-Token": process.env.GOLEMIO_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AIR QUALITY API ERROR:", response.status, errorText);
      return res.status(response.status).json({
        error: "Air quality lookup failed",
        details: errorText
      });
    }

    const payload = await response.json();
    const features = Array.isArray(payload?.features)
      ? payload.features
      : Array.isArray(payload?.data?.features)
        ? payload.data.features
        : [];

    const items = features
      .map((feature) => parseStation(feature, lat, lon))
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.round(limit));

    return res.status(200).json({
      items,
      total: items.length
    });
  } catch (error) {
    console.error("AIR QUALITY ERROR:", error);
    return res.status(500).json({ error: "Air quality failed" });
  }
}
