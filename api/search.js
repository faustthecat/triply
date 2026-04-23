let cachedStops = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
const QUERY_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_RESULTS = 10;
const STOPS_PAGE_SIZE = 5000;
const MAX_STOPS_PAGES = 12;
const queryCache = new Map();

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseStop(feature) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  const lon = Array.isArray(coordinates) ? Number(coordinates[0]) : NaN;
  const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : NaN;
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

  const id =
      feature?.id ||
      feature?.gtfs_id ||
      feature?.stop_id ||
      properties?.id ||
      properties?.gtfs_id ||
      properties?.stop_id ||
      "";
  const zoneId = feature?.zone_id || properties?.zone_id || "";

  return {
    id,
    name,
    fullName,
    subtitle,
    lat,
    lon,
    isMetro:
      String(zoneId) === "0" ||
      /S\d+$/i.test(String(id)) ||
      /Z10\d$/i.test(String(id)) ||
      /Z10\dP$/i.test(String(id)),
    parentId:
      feature?.parent_station ||
      feature?.parentStation ||
      properties?.parent_station ||
      properties?.parentStation ||
      ""
  };
}

function sortStopIds(ids) {
  return Array.from(new Set(ids.filter(Boolean))).sort((a, b) => a.localeCompare(b, "cs"));
}

function groupStops(stops) {
  const groups = new Map();

  for (const stop of stops) {
    const isMetro = Boolean(stop.isMetro);
    const baseGroupKey = isMetro
      ? stop.fullName || stop.name || stop.id
      : stop.parentId || stop.fullName || stop.name || stop.id;
    const groupKey = baseGroupKey + (isMetro ? "|metro" : "|surface");

    if (!groupKey) {
      continue;
    }

    const normalizedGroupKey = normalizeText(groupKey);
    const existing = groups.get(normalizedGroupKey);

    if (!existing) {
      groups.set(normalizedGroupKey, {
        id: stop.id,
        ids: sortStopIds([stop.id]),
        name: stop.name,
        fullName: stop.fullName || stop.name || stop.id,
        subtitle: stop.subtitle || "",
        isMetro,
        lat: stop.lat,
        lon: stop.lon
      });
      continue;
    }

    existing.ids = sortStopIds(existing.ids.concat(stop.id));

    if ((!existing.fullName || existing.fullName.length > stop.fullName.length) && stop.fullName) {
      existing.fullName = stop.fullName;
    }

    if ((!existing.name || existing.name.length > stop.name.length) && stop.name) {
      existing.name = stop.name;
    }

    if ((!existing.subtitle || existing.subtitle.length > stop.subtitle.length) && stop.subtitle) {
      existing.subtitle = stop.subtitle;
    }

    existing.isMetro = existing.isMetro || isMetro;

    if (!Number.isFinite(existing.lat) && Number.isFinite(stop.lat)) {
      existing.lat = stop.lat;
    }

    if (!Number.isFinite(existing.lon) && Number.isFinite(stop.lon)) {
      existing.lon = stop.lon;
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    id: group.ids[0] || group.id
  }));
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

function getFeatureStopId(feature) {
  return (
    feature?.id ||
    feature?.gtfs_id ||
    feature?.stop_id ||
    feature?.properties?.id ||
    feature?.properties?.gtfs_id ||
    feature?.properties?.stop_id ||
    ""
  );
}

function collectLocalMatches(stops, normalizedQuery) {
  return stops.filter(
    (stop) =>
      stop.normalizedPrimaryName.includes(normalizedQuery) ||
      stop.normalizedFullName.includes(normalizedQuery) ||
      stop.normalizedSubtitle.includes(normalizedQuery)
  );
}

function isCatalogWarm() {
  return Boolean(cachedStops) && Date.now() - cachedAt < CACHE_TTL_MS;
}

function getCachedQueryResult(normalizedQuery) {
  const cached = queryCache.get(normalizedQuery);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.at > QUERY_CACHE_TTL_MS) {
    queryCache.delete(normalizedQuery);
    return null;
  }

  return cached.value;
}

function setCachedQueryResult(normalizedQuery, value) {
  queryCache.set(normalizedQuery, {
    at: Date.now(),
    value
  });

  if (queryCache.size > 120) {
    const firstKey = queryCache.keys().next().value;
    if (firstKey) {
      queryCache.delete(firstKey);
    }
  }
}

function sortMatchedStops(stops, normalizedQuery) {
  return stops
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
}

async function loadAllStops() {
  const now = Date.now();
  if (cachedStops && now - cachedAt < CACHE_TTL_MS) {
    return cachedStops;
  }

  async function fetchStopsPage(extraParams) {
    const params = new URLSearchParams({
      limit: String(STOPS_PAGE_SIZE),
      ...extraParams
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
    return data?.features || data?.data?.features || data?.stops || [];
  }

  async function fetchCatalogWithStrategy(buildParams) {
    const collected = [];
    const seenPageSignatures = new Set();

    for (let index = 0; index < MAX_STOPS_PAGES; index += 1) {
      const pageStops = await fetchStopsPage(buildParams(index));

      if (!pageStops.length) {
        break;
      }

      const pageSignature = [
        getFeatureStopId(pageStops[0]),
        getFeatureStopId(pageStops[pageStops.length - 1]),
        pageStops.length
      ].join("|");

      if (seenPageSignatures.has(pageSignature)) {
        break;
      }

      seenPageSignatures.add(pageSignature);
      collected.push(...pageStops);

      if (pageStops.length < STOPS_PAGE_SIZE) {
        break;
      }
    }

    return collected;
  }

  const rawStops = await fetchCatalogWithStrategy((index) => ({
    offset: String(index * STOPS_PAGE_SIZE)
  }));

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
    const cachedResult = getCachedQueryResult(normalizedQuery);

    if (cachedResult) {
      return res.status(200).json(cachedResult);
    }

    const matchingStops = await loadMatchingStops(name);
    const combinedStops = new Map();

    for (const stop of matchingStops) {
      if (!combinedStops.has(stop.id)) {
        combinedStops.set(stop.id, stop);
      }
    }

    let matches = sortMatchedStops(Array.from(combinedStops.values()), normalizedQuery);

    if (matches.length < MAX_RESULTS) {
      let localCatalog = null;

      if (isCatalogWarm()) {
        localCatalog = cachedStops;
      } else {
        try {
          // Ensure first queries can still find common stops when filtered API is too strict.
          localCatalog = await loadAllStops();
        } catch (error) {
          console.error("SEARCH WARMUP ERROR:", error);
        }
      }

      if (Array.isArray(localCatalog) && localCatalog.length) {
        const localMatches = collectLocalMatches(localCatalog, normalizedQuery);

        for (const stop of localMatches) {
          if (!combinedStops.has(stop.id)) {
            combinedStops.set(stop.id, stop);
          }
        }

        matches = sortMatchedStops(Array.from(combinedStops.values()), normalizedQuery);
      }
    }

    const groupedMatches = groupStops(matches)
      .map((stop) => ({
        id: stop.id,
        ids: stop.ids,
        name: stop.name,
        fullName: stop.fullName,
        subtitle: stop.subtitle,
        isMetro: stop.isMetro,
        lat: stop.lat,
        lon: stop.lon,
        normalizedPrimaryName: normalizeText(stop.name),
        normalizedFullName: normalizeText(stop.fullName),
        normalizedSubtitle: normalizeText(stop.subtitle)
      }))
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
      })
      .slice(0, MAX_RESULTS)
      .map((stop) => ({
        id: stop.id,
        ids: stop.ids,
        name: stop.name,
        fullName: stop.fullName,
        subtitle: stop.subtitle,
        isMetro: stop.isMetro,
        lat: stop.lat,
        lon: stop.lon
      }));

    setCachedQueryResult(normalizedQuery, groupedMatches);

    return res.status(200).json(groupedMatches);
  } catch (e) {
    console.error("SEARCH ERROR:", e);
    return res.status(500).json({ error: "Search failed", details: e.message });
  }
}
