const MAX_LIMIT = 20;

const PRIORITY_SCORE = {
  high: 0,
  normal: 1,
  low: 2
};

function toIsoString(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizePriority(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "high" || normalized === "normal" || normalized === "low") {
    return normalized;
  }
  return "normal";
}

function normalizeRelatedStop(stop) {
  const id = String(stop?.id || "").trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: String(stop?.name || "").trim(),
    platformCode: String(stop?.platform_code || "").trim()
  };
}

function normalizeInfotext(item) {
  const relatedStops = Array.isArray(item?.related_stops)
    ? item.related_stops.map(normalizeRelatedStop).filter(Boolean)
    : [];

  return {
    id: String(item?.id || "").trim(),
    text: String(item?.text || "").trim(),
    textEn: String(item?.text_en || "").trim(),
    displayType: String(item?.display_type || "").trim() || "inline",
    priority: normalizePriority(item?.priority),
    validFrom: toIsoString(item?.valid_from),
    validTo: toIsoString(item?.valid_to),
    relatedStops
  };
}

function intersectsStopIds(item, stopIdsSet) {
  if (!stopIdsSet.size) {
    return true;
  }

  if (!item.relatedStops.length) {
    return true;
  }

  return item.relatedStops.some((stop) => stopIdsSet.has(stop.id));
}

function compareInfotexts(a, b) {
  const priorityDiff = (PRIORITY_SCORE[a.priority] ?? 1) - (PRIORITY_SCORE[b.priority] ?? 1);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const aTime = a.validFrom ? new Date(a.validFrom).getTime() : 0;
  const bTime = b.validFrom ? new Date(b.validFrom).getTime() : 0;
  return bTime - aTime;
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const stopIds = String(req.query.stopIds || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const limit = Number(req.query.limit || 6);
    if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    const params = new URLSearchParams({
      includeFuture: "false"
    });

    const response = await fetch(
      "https://api.golemio.cz/v3/pid/infotexts?" + params.toString(),
      {
        headers: {
          "X-Access-Token": process.env.GOLEMIO_KEY
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DISRUPTIONS API ERROR:", response.status, errorText);
      return res.status(response.status).json({
        error: "Disruptions lookup failed",
        details: errorText
      });
    }

    const rawData = await response.json();
    const stopIdsSet = new Set(stopIds);

    const items = (Array.isArray(rawData) ? rawData : [])
      .map(normalizeInfotext)
      .filter((item) => item.id && item.text)
      .filter((item) => intersectsStopIds(item, stopIdsSet))
      .sort(compareInfotexts)
      .slice(0, Math.round(limit));

    return res.status(200).json({
      items,
      total: items.length
    });
  } catch (error) {
    console.error("DISRUPTIONS ERROR:", error);
    return res.status(500).json({ error: "Disruptions failed" });
  }
}
