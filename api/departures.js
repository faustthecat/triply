export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const stopIds = String(req.query.stopId || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!stopIds.length) {
      return res.status(400).json({ error: "Missing stopId" });
    }

    const limit = Number(req.query.limit || 10);

    if (!Number.isFinite(limit) || limit < 1 || limit > 40) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    const params = new URLSearchParams({
      limit: String(Math.round(limit))
    });

    for (const stopId of stopIds) {
      params.append("ids[]", stopId);
    }

    const response = await fetch(
      "https://api.golemio.cz/v2/pid/departureboards?" + params.toString(),
      {
        headers: {
          "X-Access-Token": process.env.GOLEMIO_KEY
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DEPARTURES API ERROR:", response.status, errorText);
      return res.status(response.status).json({
        error: "Departures lookup failed",
        details: errorText
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error("DEPARTURES ERROR:", e);
    return res.status(500).json({ error: "Departures failed" });
  }
}
