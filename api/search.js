function parseStop(feature) {
  const properties = feature?.properties || {};

  return {
    id: properties.id,
    name: properties.name
  };
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const name = String(req.query.name || "").trim();

    if (name.length < 2) {
      return res.status(400).json({ error: "Missing or too short name" });
    }

    const params = new URLSearchParams({
      names: name
    });

    const response = await fetch("https://api.golemio.cz/v2/pid/stops?" + params.toString(), {
      headers: {
        "X-Access-Token": process.env.GOLEMIO_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("SEARCH API ERROR:", response.status, errorText);
      return res.status(response.status).json({
        error: "Search lookup failed",
        details: errorText
      });
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    const stops = features
      .map(parseStop)
      .filter((stop) => stop.id && stop.name);

    return res.status(200).json(stops);
  } catch (e) {
    console.error("SEARCH ERROR:", e);
    return res.status(500).json({ error: "Search failed", details: e.message });
  }
}
