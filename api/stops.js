export default async function handler(req, res) {
  try {
    // 🔍 TEST MODE
    if (req.query.test) {
      const response = await fetch(
        `https://api.golemio.cz/v2/pid/stops?limit=5`,
        {
          headers: {
            "X-Access-Token": process.env.GOLEMIO_KEY
          }
        }
      );

      const data = await response.json();
      return res.status(200).json(data);
    }

    // 📍 normální logika (zatím nech být, doladíme později)
    const { lat, lon } = req.query;

    res.status(200).json([]);

  } catch (e) {
    console.error("STOPS ERROR:", e);
    res.status(500).json({ error: "Stops failed" });
  }
}
