function normalizeVehiclePositionPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => normalizeVehiclePositionPayload(item));
  }

  if (Array.isArray(payload?.features)) {
    return payload.features.flatMap((item) => normalizeVehiclePositionPayload(item));
  }

  if (Array.isArray(payload?.data)) {
    return payload.data.flatMap((item) => normalizeVehiclePositionPayload(item));
  }

  if (payload && typeof payload === "object") {
    return [payload];
  }

  return [];
}

function normalizeStopsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => normalizeStopsPayload(item));
  }

  if (Array.isArray(payload?.features)) {
    return payload.features.flatMap((item) => normalizeStopsPayload(item));
  }

  if (Array.isArray(payload?.stops)) {
    return payload.stops.flatMap((item) => normalizeStopsPayload(item));
  }

  if (Array.isArray(payload?.data)) {
    return payload.data.flatMap((item) => normalizeStopsPayload(item));
  }

  if (payload && typeof payload === "object") {
    return [payload];
  }

  return [];
}

function parseStopIdentity(item) {
  const properties = item?.properties || {};
  const id = String(
    item?.id ??
      item?.gtfs_id ??
      item?.stop_id ??
      properties?.id ??
      properties?.gtfs_id ??
      properties?.stop_id ??
      ""
  ).trim();

  const name = String(
    item?.name ??
      item?.stop_name ??
      properties?.name ??
      properties?.stop_name ??
      ""
  ).trim();

  return { id, name };
}

async function resolveStopNames(stopIds) {
  const uniqueStopIds = Array.from(new Set((stopIds || []).filter(Boolean))).slice(0, 60);

  if (!uniqueStopIds.length || !process.env.GOLEMIO_KEY) {
    return new Map();
  }

  const params = new URLSearchParams();
  params.set("limit", String(Math.max(uniqueStopIds.length, 20)));
  uniqueStopIds.forEach((stopId) => {
    params.append("ids[]", stopId);
  });

  const response = await fetch(
    "https://api.golemio.cz/v2/gtfs/stops?" + params.toString(),
    {
      headers: {
        "X-Access-Token": process.env.GOLEMIO_KEY
      }
    }
  );

  if (!response.ok) {
    return new Map();
  }

  const payload = await response.json();
  const nameMap = new Map();

  normalizeStopsPayload(payload)
    .map(parseStopIdentity)
    .forEach((stop) => {
      if (stop.id && stop.name && !nameMap.has(stop.id)) {
        nameMap.set(stop.id, stop.name);
      }
    });

  return nameMap;
}

function parseVehiclePosition(item) {
  const properties = item?.properties || item?.vehicle || {};
  const trip = item?.trip || properties?.trip || {};
  const tripGtfs = trip?.gtfs || properties?.trip?.gtfs || {};
  const vehicle = item?.vehicle || properties?.vehicle || {};
  const lastPosition = item?.last_position || properties?.last_position || {};
  const delaySeconds = Number(
    lastPosition?.delay?.actual ??
      item?.delay?.actual ??
      item?.delay ??
      properties?.delay ??
      NaN
  );
  const coordinates = item?.geometry?.coordinates;

  const lon = Array.isArray(coordinates)
    ? Number(coordinates[0])
    : Number(
        item?.position?.longitude ??
          properties?.position_longitude ??
          properties?.longitude ??
          item?.longitude
      );
  const lat = Array.isArray(coordinates)
    ? Number(coordinates[1])
    : Number(
        item?.position?.latitude ??
          properties?.position_latitude ??
          properties?.latitude ??
          item?.latitude
      );

  return {
    tripId: String(
      trip?.id ??
        tripGtfs?.trip_id ??
        tripGtfs?.id ??
        trip?.gtfs_trip_id ??
        trip?.trip_id ??
        properties?.trip?.gtfs?.trip_id ??
        properties?.trip_id ??
        item?.trip_id ??
        ""
    ).trim(),
    vehicleId: String(
      vehicle?.id ??
        properties?.vehicle_id ??
        item?.vehicle_id ??
        item?.id ??
        ""
    ).trim(),
    lat,
    lon,
    timestamp:
      lastPosition?.origin_timestamp ??
      item?.last_position?.timestamp ??
      item?.timestamp ??
      properties?.last_position_timestamp ??
      properties?.last_position?.origin_timestamp ??
      properties?.timestamp ??
      null,
    delay: Number.isFinite(delaySeconds) ? delaySeconds : null,
    delayMinutes: Number.isFinite(delaySeconds) ? Math.round(delaySeconds / 60) : null,
    lastStopId: String(
      lastPosition?.last_stop?.id ??
        properties?.last_position?.last_stop?.id ??
        ""
    ).trim(),
    lastStopName: String(
      lastPosition?.last_stop?.name ??
        lastPosition?.last_stop?.stop_name ??
        properties?.last_position?.last_stop?.name ??
        properties?.last_position?.last_stop?.stop_name ??
        ""
    ).trim(),
    lastStopArrivalTime:
      lastPosition?.last_stop?.arrival_time ??
      properties?.last_position?.last_stop?.arrival_time ??
      null,
    lastStopDepartureTime:
      lastPosition?.last_stop?.departure_time ??
      properties?.last_position?.last_stop?.departure_time ??
      null,
    nextStopId: String(
      lastPosition?.next_stop?.id ??
        properties?.last_position?.next_stop?.id ??
        ""
    ).trim(),
    nextStopName: String(
      lastPosition?.next_stop?.name ??
        lastPosition?.next_stop?.stop_name ??
        properties?.last_position?.next_stop?.name ??
        properties?.last_position?.next_stop?.stop_name ??
        ""
    ).trim(),
    nextStopArrivalTime:
      lastPosition?.next_stop?.arrival_time ??
      properties?.last_position?.next_stop?.arrival_time ??
      null,
    bearing: Number(
      lastPosition?.bearing ??
        item?.bearing ??
        properties?.bearing ??
        item?.heading
    ),
    routeShortName: String(
      item?.route?.short_name ??
        tripGtfs?.route_short_name ??
        properties?.trip?.gtfs?.route_short_name ??
        properties?.route_short_name ??
        trip?.route_id ??
        ""
    ).trim()
  };
}

export default async function handler(req, res) {
  try {
    if (!process.env.GOLEMIO_KEY) {
      return res.status(500).json({ error: "Missing GOLEMIO_KEY" });
    }

    const tripIds = String(req.query.tripIds || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20);

    if (!tripIds.length) {
      return res.status(400).json({ error: "Missing tripIds" });
    }

    const results = await Promise.all(
      tripIds.map(async (tripId) => {
        const response = await fetch(
          "https://api.golemio.cz/v2/vehiclepositions/" + encodeURIComponent(tripId),
          {
            headers: {
              "X-Access-Token": process.env.GOLEMIO_KEY
            }
          }
        );

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error("Vehicle positions lookup failed: " + errorText);
        }

        const payload = await response.json();
        const parsed = normalizeVehiclePositionPayload(payload)
          .map(parseVehiclePosition)
          .find(
            (item) =>
              item.tripId === tripId &&
              Number.isFinite(item.lat) &&
              Number.isFinite(item.lon)
          );

        if (parsed) {
          return parsed;
        }

        return normalizeVehiclePositionPayload(payload)
          .map(parseVehiclePosition)
          .find((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)) || null;
      })
    );

    const vehicles = results.filter(Boolean);
    const missingNameStopIds = vehicles
      .filter((item) => item?.lastStopId && !item?.lastStopName)
      .map((item) => item.lastStopId)
      .concat(
        vehicles
          .filter((item) => item?.nextStopId && !item?.nextStopName)
          .map((item) => item.nextStopId)
      );
    const stopNames = await resolveStopNames(missingNameStopIds);
    const enrichedVehicles = vehicles.map((item) => {
      if (!item) {
        return item;
      }

      return {
        ...item,
        lastStopName: item.lastStopName || (item.lastStopId ? stopNames.get(item.lastStopId) || "" : ""),
        nextStopName: item.nextStopName || (item.nextStopId ? stopNames.get(item.nextStopId) || "" : "")
      };
    });

    return res.status(200).json({
      vehicles: enrichedVehicles,
      missingTripIds: tripIds.filter(
        (tripId) => !results.some((item) => item?.tripId === tripId)
      )
    });
  } catch (e) {
    console.error("VEHICLE POSITIONS ERROR:", e);
    return res.status(500).json({ error: "Vehicle positions failed", details: e.message });
  }
}
