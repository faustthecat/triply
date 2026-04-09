let cachedStops = null;
let cachedAt = 0;

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RESULTS = 10;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseStop(feature) {
  const properties = feature?.properties || {};
  const fullName =
    feature?.name ||
    feature?.stop_name ||
    properties?.name ||
    properties?.stop_name ||
    "";
  const segments = String(fullName)
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const name = segments.length > 0 ? segments[segments.length - 1] : fullName;
  const subtitle = segments.length > 1 ? segments.slice(0, -1).join(", ") : "";

  return {
    id:
      feature?.id ||
      feature?.gtfs_id ||
      feature?.stop_id ||
      properties?.id ||
      properties?.gtfs_id ||
      properties?.stop_id,
    name,
    fullName,
    subtitle
  };
}

function getScore(stop, normalizedQuery) {
  if (stop.normalizedPrimaryName === normalizedQuery) {
    return 0;
  }

  if (stop.normalizedFullName === normalizedQuery) {
    return 1;
  }

  if (stop.normalizedPrimaryName.startsWith(normalizedQuery)) {
    return 2;
  }

  if (stop.normalizedPrimaryName.includes(" " + normalizedQuery)) {
    return 3;
  }

  if (stop.normalizedFullName.startsWith(normalizedQuery)) {
    return 4;
  }

  if (stop.normalizedFullName.includes(", " + normalizedQuery)) {
    return 5;
  }

  if (stop.normalizedFullName.includes(normalizedQuery)) {
    return 6;
  }

  return 7;
}

async function loadAllStops() {
  const now = Date.now();
  if (cachedStops && now - cachedAt < CACHE_TTL_MS) {
    return cachedStops;
  }

  const params = new URLSearchParams({
    limit: "10000"
  });

  const response = await fetch("https://api.golemio.cz/v2/gtfs/stops?" + params.toString(), {
    headers: {
      "X-Access-Token": process.env.GOLEMIO_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Stops catalog lookup failed: " + errorText);
  }

  const data = await response.json();
  const rawStops =
    data?.features ||
    data?.data?.features ||
    data?.stops ||
    [];

  cachedStops = rawStops
    .map(parseStop)
    .filter((stop) => stop.id && stop.fullName)
    .map((stop) => ({
      ...stop,
      normalizedName: normalizeText(stop.name),
      normalizedPrimaryName: normalizeText(stop.name),
      normalizedFullName: normalizeText(stop.fullName),
      normalizedSubtitle: normalizeText(stop.subtitle)
    }));
  cachedAt = now;

  return cachedStops;
}

async function loadMatchingStops(name) {
  const params = new URLSearchParams({
    names: name,
    limit: "50"
  });

  const response = await fetch("https://api.golemio.cz/v2/gtfs/stops?" + params.toString(), {
    headers: {
      "X-Access-Token": process.env.GOLEMIO_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Filtered stops lookup failed: " + errorText);
  }

  const data = await response.json();
  const rawStops =
    data?.features ||
    data?.data?.features ||
    data?.stops ||
    [];

  return rawStops
    .map(parseStop)
    .filter((stop) => stop.id && stop.fullName)
    .map((stop) => ({
      ...stop,
      normalizedName: normalizeText(stop.name),
      normalizedPrimaryName: normalizeText(stop.name),
      normalizedFullName: normalizeText(stop.fullName),
      normalizedSubtitle: normalizeText(stop.subtitle)
    }));
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const name = String(req.query.name || "").trim();

    if (name.length < 2) {
      return res.status(400).json({ error: "Missing or too short name" });
    }

    const normalizedQuery = normalizeText(name);
    const matchingStops = await loadMatchingStops(name);
    const fallbackStops =
      matchingStops.length > 0
        ? matchingStops
        : (await loadAllStops()).filter(
            (stop) =>
              stop.normalizedPrimaryName.includes(normalizedQuery) ||
              stop.normalizedFullName.includes(normalizedQuery) ||
              stop.normalizedSubtitle.includes(normalizedQuery)
          );

    const matches = fallbackStops
      .filter(
        (stop) =>
          stop.normalizedPrimaryName.includes(normalizedQuery) ||
          stop.normalizedFullName.includes(normalizedQuery) ||
          stop.normalizedSubtitle.includes(normalizedQuery)
      )
      .sort((a, b) => {
        const scoreDiff = getScore(a, normalizedQuery) - getScore(b, normalizedQuery);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        const lengthDiff = a.fullName.length - b.fullName.length;
        if (lengthDiff !== 0) {
          return lengthDiff;
        }

        return a.fullName.localeCompare(b.fullName, "cs");
      });

    const uniqueByName = new Map();

    for (const stop of matches) {
      const uniqueKey = stop.normalizedFullName || stop.normalizedPrimaryName;

      if (!uniqueByName.has(uniqueKey)) {
        uniqueByName.set(uniqueKey, {
          id: stop.id,
          name: stop.name,
          fullName: stop.fullName,
          subtitle: stop.subtitle
        });
      }

      if (uniqueByName.size >= MAX_RESULTS) {
        break;
      }
    }

    return res.status(200).json(Array.from(uniqueByName.values()));
  } catch (e) {
    console.error("SEARCH ERROR:", e);
    return res.status(500).json({ error: "Search failed", details: e.message });
  }
}
