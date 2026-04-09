export default async function handler(req, res) {
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

  const stops = data.features.map(f => ({
    id: f.properties.id,
    name: f.properties.name
  }));

  res.status(200).json(stops);
}
