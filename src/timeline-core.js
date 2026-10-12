// Pure stay detection, shared by the browser and visit indexing.
export const distanceBetweenCoordinates = (a, b) => {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const phi1 = rad(a.lat),
    phi2 = rad(b.lat);
  const h =
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, h)));
};

/**
 * @typedef {Object} TimelineOptions
 * @property {Number} stayRadius
 *   Points within this many meters of a cluster's center belong to the cluster
 * @property {Number} minStayMinutes
 *   A cluster spanning at least this long is a stay rather than part of a move
 * @property {Number} gapMinutes
 *   A silence longer than this before leaving a place counts as time spent
 *   there (apps in significant-change mode report rarely while stationary)
 * @property {Number|null} maxAccuracy
 *   Ignore locations whose reported accuracy (meters) is worse than this
 * @property {Number} travelSpeed
 *   Assumed speed (km/h) for estimating when a stay ended before a silence
 * @property {Array<Object>} regions
 *   Known places `{ desc, lat, lon, rad }` (e.g. the app's regions) used to
 *   name stays whose locations carry no region, POI or address
 * @property {Number} regionMargin
 *   A stay matches a region if its center is within the region's radius plus
 *   this many meters (stay centers of sparse data are approximate)
 */

/** @type {TimelineOptions} */
export const DEFAULT_TIMELINE_OPTIONS = {
  stayRadius: 150,
  minStayMinutes: 10,
  gapMinutes: 15,
  maxAccuracy: 500,
  travelSpeed: 30,
  regions: [],
  regionMargin: 100,
};

const toLatLng = (l) => ({ lat: l.lat, lng: l.lon });

const centroid = (points) => {
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lon }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
};

const pathDistance = (latLngs) => {
  let distance = 0;
  for (let i = 1; i < latLngs.length; i++) {
    distance += distanceBetweenCoordinates(latLngs[i - 1], latLngs[i]);
  }
  return distance;
};

/**
 * Find the known region closest to a coordinate, if it is close enough.
 *
 * @param {{lat: Number, lng: Number}} center Coordinate to name
 * @param {Array<{desc: String, lat: Number, lon: Number, rad: Number}>} regions
 * @param {Number} margin Extra meters allowed beyond each region's radius
 * @returns {String|null} Name of the nearest matching region
 */
export const nearestRegion = (center, regions, margin) => {
  let best = null;
  let bestDistance = Infinity;
  (regions || []).forEach((r) => {
    if (!r || typeof r.lat !== "number" || typeof r.lon !== "number") return;
    const distance = distanceBetweenCoordinates(center, toLatLng(r));
    const radius = typeof r.rad === "number" && r.rad > 0 ? r.rad : 0;
    if (distance <= radius + margin && distance < bestDistance) {
      best = r.desc;
      bestDistance = distance;
    }
  });
  return best || null;
};

/**
 * Where a stay's name came from, best first. A saved name (`location.place`)
 * is only replaced by a name from a better source.
 */
export const PLACE_SOURCES = [
  "manual",
  "region",
  "app",
  "osm-place",
  "address",
];

const sourceRank = (source) => {
  const i = PLACE_SOURCES.indexOf(source);
  return i === -1 ? PLACE_SOURCES.length : i;
};

/**
 * Whether source `a` ranks better than source `b`.
 *
 * @param {String|null} a
 * @param {String|null} b
 * @returns {Boolean}
 */
export const isBetterSource = (a, b) => sourceRank(a) < sourceRank(b);

/**
 * Pick a human-readable name for a group of locations from what the app
 * reported: the most common region name, then a point of interest, then an
 * address.
 *
 * @param {OTLocation[]} points Locations of one stay
 * @returns {{place: String, source: String}|null}
 *   Name and its source ("region" or "app"), if any location carries one
 */
export const reportedPlace = (points) => {
  const counts = {};
  points.forEach((p) => {
    (p.inregions || []).forEach((r) => {
      counts[r] = (counts[r] || 0) + 1;
    });
  });
  const regions = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (regions.length) return { place: regions[0], source: "region" };
  const withPoi = points.find((p) => p.poi);
  if (withPoi) return { place: withPoi.poi, source: "app" };
  const withAddr = points.find((p) => p.addr);
  if (withAddr) return { place: withAddr.addr, source: "app" };
  return null;
};

/**
 * Pick a human-readable name for a group of locations: the most common
 * region name, then a point of interest, then a reverse-geocoded address.
 *
 * @param {OTLocation[]} points Locations of one stay
 * @returns {String|null} Place name, if any location carries one
 */
export const placeName = (points) => {
  const named = reportedPlace(points);
  return named ? named.place : null;
};

/**
 * A name saved for a stay earlier (`place` / `place_source` on a location,
 * set by the server), preferring the stay's first location.
 *
 * @param {OTLocation[]} points Locations of one stay, in time order
 * @returns {{place: String, source: String|null}|null}
 */
export const savedPlace = (points) => {
  const withPlace =
    points.find((p) => p.place_source === "manual" && p.place) ||
    points.find((p) => typeof p.place === "string" && p.place.trim() !== "");
  return withPlace
    ? { place: withPlace.place, source: withPlace.place_source || null }
    : null;
};

/**
 * Turn a device's locations into a sequence of stays and moves, the way a
 * "day timeline" presents them.
 *
 * A location may carry `departed` (unix seconds): the device is known to have
 * left that place then (e.g. from a region leave event). The stay ends at that
 * time instead of being extended over a following silence, and the next
 * location starts a new stay even at the same place.
 *
 * @param {OTLocation[]} locations Locations of a single device
 * @param {Partial<TimelineOptions>} [options]
 * A location may also carry `place` / `place_source`: a name saved for the
 * stay that starts there. It is used instead of looking the place up again,
 * unless the app's own data names the stay from a better source.
 *
 * @returns {Array<Object>} Segments in chronological order. Stays have
 *   `{ type: "stay", start, end, center, place, placeSource, placeSaved,
 *   count, endIsLast }` (`start` is the time of the stay's first location;
 *   `placeSaved`: that location already stores this name or a better one),
 *   moves have
 *   `{ type: "move" | "away", start, end, distance, latLngs }` ("away": left
 *   and returned to the same place). Times are unix seconds.
 */
export const buildTimeline = (locations, options = {}) => {
  const opts = { ...DEFAULT_TIMELINE_OPTIONS, ...options };
  const points = locations
    .filter(
      (l) =>
        typeof l.lat === "number" &&
        typeof l.lon === "number" &&
        typeof l.tst === "number" &&
        !(
          opts.maxAccuracy !== null &&
          typeof l.acc === "number" &&
          l.acc > opts.maxAccuracy
        )
    )
    .sort((a, b) => a.tst - b.tst);
  if (points.length === 0) return [];

  // 1. Split into spatial clusters of consecutive points.
  const clusters = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const departed = typeof points[i - 1].departed === "number";
    if (
      !departed &&
      distanceBetweenCoordinates(centroid(current), toLatLng(p)) <=
        opts.stayRadius
    ) {
      current.push(p);
    } else {
      clusters.push(current);
      current = [p];
    }
  }
  clusters.push(current);

  // 2. Decide which clusters are stays.
  const minStay = opts.minStayMinutes * 60;
  const gap = opts.gapMinutes * 60;
  const classified = clusters.map((cluster, i) => {
    const start = cluster[0].tst;
    let end = cluster[cluster.length - 1].tst;
    const next = clusters[i + 1];
    const isLast = next === undefined;
    const departed = cluster[cluster.length - 1].departed;
    if (typeof departed === "number") {
      // Known departure time: no guessing over the silence that follows.
      end = Math.max(end, departed);
    } else if (!isLast && next[0].tst - end > gap) {
      // Long silence before the next report elsewhere: we were still here,
      // until roughly the time it takes to get to the next place.
      const distance = distanceBetweenCoordinates(
        centroid(cluster),
        toLatLng(next[0])
      );
      const travel = Math.max(
        60,
        distance / ((opts.travelSpeed * 1000) / 3600)
      );
      end = Math.max(end, next[0].tst - Math.round(travel));
    }
    // Where the data ends (e.g. home for the night) is a stay too.
    const isStay = end - start >= minStay || isLast;
    return { cluster, start, end, isStay, isLast };
  });

  // 3. Emit stays, merging everything in between into moves.
  const segments = [];
  let pending = [];
  let previousStay = null;
  const flushMove = (nextStay) => {
    if (pending.length === 0 && !(previousStay && nextStay)) return;
    const latLngs = [
      ...(previousStay ? [previousStay.center] : []),
      ...pending.map(toLatLng),
      ...(nextStay ? [nextStay.center] : []),
    ];
    if (latLngs.length < 2) {
      pending = [];
      return;
    }
    const start = previousStay ? previousStay.end : pending[0].tst;
    const end = nextStay ? nextStay.start : pending[pending.length - 1].tst;
    const distance = pathDistance(latLngs);
    segments.push({
      // Left and came back to the same place without moving data in between
      // (e.g. a lunch break): "away" rather than a zero-length move.
      type:
        pending.length === 0 && distance <= opts.stayRadius ? "away" : "move",
      start,
      end: Math.max(start, end),
      distance,
      latLngs,
    });
    pending = [];
  };
  classified.forEach(({ cluster, start, end, isStay, isLast }) => {
    if (!isStay) {
      pending.push(...cluster);
      return;
    }
    const center = centroid(cluster);
    const region = nearestRegion(center, opts.regions, opts.regionMargin);
    const reported =
      reportedPlace(cluster) ||
      (region ? { place: region, source: "region" } : null);
    const saved = savedPlace(cluster);
    const named =
      saved && !(reported && isBetterSource(reported.source, saved.source))
        ? saved
        : reported;
    const first = cluster[0];
    const manual = cluster.find((p) => p.place_source === "manual");
    const stay = {
      type: "stay",
      start,
      end,
      center,
      place: named ? named.place : null,
      placeSource: named ? named.source : null,
      // A map-verified correction selects the venue without changing GPS.
      placeCenter:
        named && named.source === "manual"
          ? manual?.place_center || null
          : null,
      placeTst: named && named.source === "manual" ? manual.tst : start,
      placeOsmType:
        named && named.source === "manual" ? manual.place_osm_type : null,
      placeOsmId:
        named && named.source === "manual" ? manual.place_osm_id : null,
      placeSaved: Boolean(
        named &&
          typeof first.place === "string" &&
          first.place.trim() !== "" &&
          !isBetterSource(named.source, first.place_source || null)
      ),
      count: cluster.length,
      endIsLast: isLast,
    };
    flushMove(stay);
    segments.push(stay);
    previousStay = stay;
  });
  flushMove(null);
  return segments;
};
