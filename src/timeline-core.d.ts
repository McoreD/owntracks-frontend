export type TimelinePoint = {
  tst: number;
  lat: number;
  lon: number;
  acc?: number;
  departed?: number;
  inregions?: string[];
  poi?: string;
  addr?: string;
  place?: string | null;
  place_source?: string | null;
  place_center?: { lat: number; lng: number };
  place_osm_type?: string;
  place_osm_id?: number;
};
export type TimelineRegion = {
  desc: string;
  lat: number;
  lon: number;
  rad: number;
};
export type TimelineStay = {
  type: "stay";
  start: number;
  end: number;
  center: { lat: number; lng: number };
  place: string | null;
  placeSource: string | null;
  placeCenter: { lat: number; lng: number } | null;
  placeTst: number;
  placeOsmType: string | null;
  placeOsmId: number | null;
  placeSaved: boolean;
  count: number;
  endIsLast: boolean;
};
export type TimelineMove = {
  type: "move" | "away";
  start: number;
  end: number;
  distance: number;
  latLngs: { lat: number; lng: number }[];
};
export type TimelineSegment = TimelineStay | TimelineMove;
export type TimelineOptions = {
  regions: TimelineRegion[];
  minStayMinutes: number;
  stayRadius: number;
  regionMargin: number;
  maxAccuracy: number | null;
  gapMinutes: number;
  travelSpeed: number;
};
export const DEFAULT_TIMELINE_OPTIONS: TimelineOptions;
export const PLACE_SOURCES: string[];
export function isBetterSource(a: string | null, b: string | null): boolean;
export function reportedPlace(
  points: TimelinePoint[],
): { place: string; source: string } | null;
export function savedPlace(
  points: TimelinePoint[],
): { place: string; source: string | null } | null;
export function placeName(points: TimelinePoint[]): string | null;
export function buildTimeline(
  points: TimelinePoint[],
  options?: Partial<TimelineOptions>,
): TimelineSegment[];
export function distanceBetweenCoordinates(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number;
export function nearestRegion(
  center: { lat: number; lng: number },
  regions: TimelineRegion[],
  margin: number,
): string | null;
