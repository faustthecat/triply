export default async function handler(req, res) {
  const { lat, lon } = req.query;

  const response = await fetch(
    `https://api.golemio.cz/v2/pid/stops?lat=${lat}&lon=${lon}&range=300`,
    {
      headers: {
        "X-Access-Token": process.env.GOLEMIO_KEY
      }
    }
  );

  const data = await response.json();

  res.status(200).json(data.features.map(f => ({
    id: f.properties.id,
    name: f.properties.name
  })));
}
