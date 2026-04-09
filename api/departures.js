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

async function loadNearest() {
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    const res = await fetch(`/api/stops?lat=${lat}&lon=${lon}`);
    const stops = await res.json();

    const nearest = stops[0]; // nejbližší
    document.getElementById("stopId").value = nearest.id;

    load();
  });
}

async function searchStop() {
  const q = document.getElementById("search").value;

  if (q.length < 2) return;

  const res = await fetch(`/api/search?name=${q}`);
  const data = await res.json();

  const results = document.getElementById("results");
  results.innerHTML = "";

  data.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s.name;

    li.onclick = () => {
      document.getElementById("stopId").value = s.id;
      load();
    };

    results.appendChild(li);
  });
}
