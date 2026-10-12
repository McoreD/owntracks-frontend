import moment from "moment";

export {
  DEFAULT_TIMELINE_OPTIONS,
  PLACE_SOURCES,
  isBetterSource,
  nearestRegion,
  reportedPlace,
  savedPlace,
  placeName,
  buildTimeline,
} from "./timeline-core.js";

/**
 * Count locations per local calendar day.
 *
 * @param {OTLocation[]} locations
 * @returns {Object<String, Number>} "YYYY-MM-DD" (browser timezone) to count
 */
export const countByDay = (locations) => {
  const counts = {};
  locations.forEach((l) => {
    const day = moment.unix(l.tst).format("YYYY-MM-DD");
    counts[day] = (counts[day] || 0) + 1;
  });
  return counts;
};

/**
 * Format a duration in seconds as "2 h 05 min" / "35 min".
 *
 * @param {Number} seconds
 * @returns {String}
 */
export const humanReadableDuration = (seconds) => {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
};

/**
 * Short, human-readable label from a Nominatim reverse geocoding response
 * (`format=jsonv2`), e.g. "Kings Park" or "12 Hay Street, Subiaco".
 *
 * @param {Object} response Parsed JSON response
 * @returns {String|null} Label, or null if the response has no address
 */
export const addressLabel = (response) => {
  if (!response || response.error) return null;
  const a = response.address || {};
  const street = [a.house_number, a.road || a.pedestrian || a.footway]
    .filter(Boolean)
    .join(" ");
  const area =
    a.suburb ||
    a.neighbourhood ||
    a.quarter ||
    a.city_district ||
    a.town ||
    a.village ||
    a.city ||
    null;
  const primary = response.name || street || area;
  if (!primary) {
    const parts = (response.display_name || "").split(",").map((s) => s.trim());
    return parts.filter(Boolean).slice(0, 2).join(", ") || null;
  }
  return area && area !== primary ? `${primary}, ${area}` : primary;
};

/**
 * Cache key for a coordinate, rounded to about 11 m.
 *
 * @param {{lat: Number, lng: Number}} c
 * @returns {String}
 */
export const coordinateKey = (c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
