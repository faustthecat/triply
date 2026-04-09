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

function parseStop(feature, originLat, originLon) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties || {};
  const lon = Array.isArray(coordinates) ? Number(coordinates[0]) : NaN;
  const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  return {
    id: properties.id,
    name: properties.name,
    distance: hasCoords ? distanceInMeters(originLat, originLon, lat, lon) : null
  };
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    if (req.query.test) {
      const response = await fetch("https://api.golemio.cz/v2/pid/stops", {
        headers: {
          "X-Access-Token": process.env.GOLEMIO_KEY
        }
      });

      const data = await response.json();
      return res.status(response.ok ? 200 : response.status).json(data);
    }

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "Missing or invalid lat/lon" });
    }

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      range: "500",
      limit: "10"
    });

    const response = await fetch("https://api.golemio.cz/v2/pid/stops?" + params.toString(), {
      headers: {
        "X-Access-Token": process.env.GOLEMIO_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("STOPS API ERROR:", response.status, errorText);
      return res.status(response.status).json({ error: "Stops lookup failed" });
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    const stops = features
      .map((feature) => parseStop(feature, lat, lon))
      .filter((stop) => stop.id && stop.name)
      .sort((a, b) => {
        if (a.distance == null) {
          return 1;
        }

        if (b.distance == null) {
          return -1;
        }

        return a.distance - b.distance;
      });

    return res.status(200).json(stops);
  } catch (e) {
    console.error("STOPS ERROR:", e);
    return res.status(500).json({ error: "Stops failed" });
  }
}
