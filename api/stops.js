export default async function handler(req, res) {
  try {
    const { lat, lon } = req.query;

    const response = await fetch(
      `https://api.golemio.cz/v2/pid/stops?lat=${lat}&lon=${lon}&range=1500`,
      {
        headers: {
          "X-Access-Token": process.env.GOLEMIO_KEY
        }
      }
    );

    const data = await response.json();

    console.log("STOPS RESPONSE:", JSON.stringify(data));

    const features = data.features || [];

    const stops = features.map(f => ({
      id: f.properties?.id,
      name: f.properties?.name
    }));

    res.status(200).json(stops);

  } catch (e) {
    console.error("STOPS ERROR:", e);
    res.status(500).json({ error: "Stops failed" });
  }
}
