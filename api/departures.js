export default async function handler(req, res) {
  const stopId = req.query.stopId;

  if (!stopId) {
    return res.status(400).json({ error: "Missing stopId" });
  }

  const response = await fetch(
    `https://api.golemio.cz/v2/pid/departureboards?ids=${stopId}&limit=10`,
    {
      headers: {
        "X-Access-Token": process.env.GOLEMIO_KEY
      }
    }
  );

  const data = await response.json();

  res.status(200).json(data);
}
