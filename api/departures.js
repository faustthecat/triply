export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const stopId = String(req.query.stopId || "").trim();

    if (!stopId) {
      return res.status(400).json({ error: "Missing stopId" });
    }

    const params = new URLSearchParams({
      ids: stopId,
      limit: "10"
    });

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
      return res.status(response.status).json({ error: "Departures lookup failed" });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error("DEPARTURES ERROR:", e);
    return res.status(500).json({ error: "Departures failed" });
  }
}
