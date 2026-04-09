export default async function handler(req, res) {
  try {
    const { lat, lon } = req.query;

    // stáhneme všechny zastávky (limit)
    const response = await fetch(
      `https://api.golemio.cz/v2/pid/stops?limit=200`,
      {
        headers: {
          "X-Access-Token": process.env.GOLEMIO_KEY
        }
      }
    );

    const data = await response.json();

    const features = data.features || [];

    const stops = features.map(f => {
      const s = f.properties;

      // jednoduchá vzdálenost (stačí pro krátké vzdálenosti)
      const dx = lat - s.lat;
      const dy = lon - s.lon;

      const dist = Math.sqrt(dx * dx + dy * dy);

      return {
        id: s.id,
        name: s.name,
        dist
      };
    });

    // seřadíme podle vzdálenosti
    stops.sort((a, b) => a.dist - b.dist);

    // vrátíme jen pár nejbližších
    res.status(200).json(stops.slice(0, 5));

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Stops failed" });
  }
}
