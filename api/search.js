export default async function handler(req, res) {
  try {
    const name = req.query.name;

    const response = await fetch(
      `https://api.golemio.cz/v2/pid/stops?names=${encodeURIComponent(name)}`,
      {
        headers: {
          "X-Access-Token": process.env.GOLEMIO_KEY
        }
      }
    );

    const data = await response.json();

    console.log("GOLEMIO RESPONSE:", JSON.stringify(data));

    const features = data.features || [];

    const stops = features.map(f => ({
      id: f.properties?.id,
      name: f.properties?.name
    }));

    res.status(200).json(stops);

  } catch (e) {
    console.error("SEARCH ERROR:", e);
    res.status(500).json({ error: "Search failed" });
  }
}
