<template>
  <aside
    class="day-timeline"
    :class="$mq === 'sm' ? 'day-timeline-sm' : null"
    :aria-label="$t('Timeline')"
  >
    <div class="day-timeline-header">
      <button
        class="button button-flat button-icon"
        :title="$t('Previous day')"
        @click="shiftDay(-1)"
      >
        <ChevronLeftIcon size="1x" :aria-label="$t('Previous day')" />
      </button>
      <strong class="day-timeline-title">{{ day.format("dddd, LL") }}</strong>
      <button
        class="button button-flat button-icon"
        :title="$t('Next day')"
        :disabled="isToday"
        @click="shiftDay(1)"
      >
        <ChevronRightIcon size="1x" :aria-label="$t('Next day')" />
      </button>
      <button
        class="button button-flat button-icon"
        :title="$t('Close timeline')"
        @click="close"
      >
        <XIcon size="1x" :aria-label="$t('Close timeline')" />
      </button>
    </div>

    <div class="day-timeline-calendar">
      <div class="calendar-nav">
        <button
          v-if="showMonth"
          class="button button-flat button-icon"
          :title="$t('Previous month')"
          @click="shiftMonth(-1)"
        >
          <ChevronLeftIcon size="1x" :aria-label="$t('Previous month')" />
        </button>
        <button
          class="button button-flat calendar-title"
          :title="$t('Jump to a year, month or date')"
          :aria-expanded="jumpOpen ? 'true' : 'false'"
          @click="toggleJump"
        >
          {{ month.format("MMMM YYYY") }}
          <ChevronDownIcon size="0.9x" aria-hidden="true" />
        </button>
        <button
          v-if="showMonth"
          class="button button-flat button-icon"
          :title="$t('Next month')"
          :disabled="month.isSame(today, 'month')"
          @click="shiftMonth(1)"
        >
          <ChevronRightIcon size="1x" :aria-label="$t('Next month')" />
        </button>
        <button
          v-if="$mq === 'sm'"
          class="button button-flat calendar-toggle"
          :aria-expanded="monthExpanded ? 'true' : 'false'"
          @click="monthExpanded = !monthExpanded"
        >
          {{ monthExpanded ? $t("Week") : $t("Month") }}
        </button>
      </div>
      <div v-if="jumpOpen" class="calendar-jump">
        <div class="jump-year">
          <button
            class="button button-flat button-icon"
            :title="$t('Previous year')"
            :disabled="jumpYear <= minYear"
            @click="jumpYear--"
          >
            <ChevronLeftIcon size="1x" :aria-label="$t('Previous year')" />
          </button>
          <select v-model.number="jumpYear" :aria-label="$t('Year')">
            <option v-for="year in years" :key="year" :value="year">
              {{ year }}
            </option>
          </select>
          <button
            class="button button-flat button-icon"
            :title="$t('Next year')"
            :disabled="jumpYear >= today.year()"
            @click="jumpYear++"
          >
            <ChevronRightIcon size="1x" :aria-label="$t('Next year')" />
          </button>
        </div>
        <div class="jump-months">
          <button
            v-for="(name, index) in monthNames"
            :key="name"
            class="jump-month"
            :class="{
              'jump-month-current':
                jumpYear === month.year() && index === month.month(),
            }"
            :disabled="
              jumpYear > today.year() ||
              (jumpYear === today.year() && index > today.month())
            "
            @click="pickMonth(index)"
          >
            {{ name }}
          </button>
        </div>
        <div class="jump-date">
          <input
            type="date"
            :max="today.format('YYYY-MM-DD')"
            :value="day.format('YYYY-MM-DD')"
            :aria-label="$t('Go to date')"
            @change="goToDate($event.target.value)"
          />
          <button class="button button-flat jump-today" @click="goToday">
            {{ $t("Today") }}
          </button>
        </div>
      </div>
      <div v-else class="calendar-grid" role="grid">
        <span
          v-for="weekday in weekdays"
          :key="weekday"
          class="calendar-weekday"
          role="columnheader"
        >
          {{ weekday }}
        </span>
        <button
          v-for="cell in visibleCells"
          :key="cell.key"
          class="calendar-day"
          :class="{
            'calendar-day-outside': !cell.inMonth,
            'calendar-day-selected': cell.selected,
            'calendar-day-today': cell.today,
          }"
          :disabled="cell.future"
          :title="
            cell.count
              ? $t('{count} locations', { count: cell.count })
              : $t('No locations')
          "
          @click="selectDay(cell.date)"
        >
          {{ cell.date.date() }}
          <span
            class="calendar-dot"
            :style="{ opacity: cell.count ? dotOpacity(cell.count) : 0 }"
          ></span>
        </button>
      </div>
    </div>

    <p v-if="!Object.keys(devices).length" class="day-timeline-hint">
      {{ $t("Loading...") }}
    </p>
    <p v-else-if="!target" class="day-timeline-hint">
      {{ $t("Select a user and device to see their timeline.") }}
    </p>
    <p v-else-if="segments.length === 0" class="day-timeline-hint">
      {{ $t("No locations on this day.") }}
    </p>
    <ol v-else class="day-timeline-segments">
      <li
        v-for="(segment, i) in segments"
        :key="i"
        :class="`segment segment-${segment.type}`"
      >
        <button class="segment-button" @click="focus(segment)">
          <time class="segment-time">{{ formatTime(segment.start) }}</time>
          <span class="segment-marker" aria-hidden="true">
            <MapPinIcon v-if="segment.type === 'stay'" size="1x" />
            <NavigationIcon v-else size="0.8x" />
          </span>
          <span class="segment-body">
            <template v-if="segment.type === 'stay'">
              <strong :title="formatCoordinate(segment.center)">
                {{ stayLabel(segment) }}
              </strong>
              <small v-if="segment.endIsLast && segment.end === segment.start">
                {{ $t("From {time}", { time: formatTime(segment.start) }) }}
              </small>
              <small v-else>
                {{ formatTime(segment.start) }} –
                {{ formatTime(segment.end) }}
                · {{ humanReadableDuration(segment.end - segment.start) }}
              </small>
            </template>
            <template v-else-if="segment.type === 'away'">
              <span>{{ $t("Away") }}</span>
              <small>
                {{ humanReadableDuration(segment.end - segment.start) }}
              </small>
            </template>
            <template v-else>
              <span>{{ $t("Moving") }}</span>
              <small>
                {{ humanReadableDistance(Math.round(segment.distance)) }}
                · {{ humanReadableDuration(segment.end - segment.start) }}
              </small>
            </template>
          </span>
        </button>
      </li>
    </ol>
  </aside>
</template>

<script>
import moment from "moment";
import { mapActions, mapMutations, mapState } from "vuex";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  NavigationIcon,
  XIcon,
} from "vue-feather-icons";

import * as api from "@/api";
import { DATE_TIME_FORMAT } from "@/constants";
import { log } from "@/logging";
import * as types from "@/store/mutation-types";
import {
  addressLabel,
  buildTimeline,
  coordinateKey,
  countByDay,
  humanReadableDuration,
} from "@/timeline";
import { humanReadableDistance } from "@/util";

const toUtc = (m) => m.clone().utc().format(DATE_TIME_FORMAT);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reverse geocoding results for the page's lifetime, keyed by rounded
// coordinate (null: looked up, no address). Shared across panel re-opens.
const addressCache = {};

export default {
  components: {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    MapPinIcon,
    NavigationIcon,
    XIcon,
  },
  data() {
    return {
      month: moment().startOf("month"),
      monthCounts: {},
      monthAbortController: null,
      // On small screens only the selected week is shown until expanded
      monthExpanded: false,
      jumpOpen: false,
      jumpYear: moment().year(),
      addresses: { ...addressCache },
      geocodeRun: 0,
      today: moment().startOf("day"),
    };
  },
  computed: {
    ...mapState([
      "devices",
      "locationHistory",
      "selectedDevice",
      "selectedUser",
      "startDateTime",
      "endDateTime",
    ]),
    /** The single user/device the timeline is about, or null if ambiguous. */
    target() {
      if (this.selectedUser && this.selectedDevice) {
        return { user: this.selectedUser, device: this.selectedDevice };
      }
      const all = Object.keys(this.devices).flatMap((user) =>
        (this.devices[user] || []).map((device) => ({ user, device }))
      );
      if (this.selectedUser) {
        const own = all.filter((d) => d.user === this.selectedUser);
        return own.length === 1 ? own[0] : null;
      }
      return all.length === 1 ? all[0] : null;
    },
    day() {
      return moment
        .utc(this.startDateTime, DATE_TIME_FORMAT)
        .local()
        .startOf("day");
    },
    isToday() {
      return this.day.isSame(this.today, "day");
    },
    dayLocations() {
      if (!this.target) return [];
      const { user, device } = this.target;
      const locations =
        (this.locationHistory[user] && this.locationHistory[user][device]) ||
        [];
      const start = this.day.unix();
      const end = this.day.clone().endOf("day").unix();
      return locations.filter((l) => l.tst >= start && l.tst <= end);
    },
    segments() {
      return buildTimeline(this.dayLocations, this.$config.timeline);
    },
    weekdays() {
      const first = moment().startOf("week");
      return [...Array(7).keys()].map((i) =>
        first.clone().add(i, "days").format("dd")
      );
    },
    calendarCells() {
      const start = this.month.clone().startOf("week");
      const end = this.month.clone().endOf("month").endOf("week");
      const cells = [];
      for (
        let d = start.clone();
        d.isSameOrBefore(end, "day");
        d.add(1, "day")
      ) {
        const key = d.format("YYYY-MM-DD");
        cells.push({
          key,
          date: d.clone(),
          count: this.monthCounts[key] || 0,
          inMonth: d.isSame(this.month, "month"),
          selected: d.isSame(this.day, "day"),
          today: d.isSame(this.today, "day"),
          future: d.isAfter(this.today, "day"),
        });
      }
      return cells;
    },
    minYear() {
      return this.today.year() - 30;
    },
    years() {
      const years = [];
      for (let y = this.today.year(); y >= this.minYear; y--) years.push(y);
      return years;
    },
    monthNames() {
      return moment.monthsShort();
    },
    showMonth() {
      return this.$mq !== "sm" || this.monthExpanded;
    },
    visibleCells() {
      if (this.showMonth) return this.calendarCells;
      return this.calendarCells.filter((c) => c.date.isSame(this.day, "week"));
    },
    maxCount() {
      return Math.max(1, ...Object.values(this.monthCounts));
    },
  },
  watch: {
    segments: {
      handler() {
        this.lookupAddresses();
      },
      immediate: true,
    },
    target() {
      this.loadMonth();
    },
    month() {
      this.loadMonth();
    },
    day(day) {
      if (!day.isSame(this.month, "month")) {
        this.month = day.clone().startOf("month");
      }
    },
  },
  created() {
    // The timeline shows one day. Narrow a longer range down to its last day.
    const end = moment.utc(this.endDateTime, DATE_TIME_FORMAT).local();
    if (!end.isSame(this.day, "day")) {
      this.selectDay(moment.min(end, moment()));
    }
    this.month = this.day.clone().startOf("month");
    this.loadMonth();
  },
  mounted() {
    window.addEventListener("keydown", this.onKeydown);
  },
  beforeDestroy() {
    window.removeEventListener("keydown", this.onKeydown);
    this.geocodeRun++;
    if (this.monthAbortController) this.monthAbortController.abort();
  },
  methods: {
    ...mapActions(["setDateTimeRange"]),
    ...mapMutations({
      setTimelineOpen: types.SET_TIMELINE_OPEN,
      setTimelineHighlight: types.SET_TIMELINE_HIGHLIGHT,
    }),
    humanReadableDistance,
    humanReadableDuration,
    formatTime(tst) {
      return moment.unix(tst).format("LT");
    },
    stayLabel(segment) {
      return (
        segment.place ||
        this.addresses[coordinateKey(segment.center)] ||
        this.formatCoordinate(segment.center)
      );
    },
    /**
     * Name stays that have no region, POI or address by reverse geocoding
     * their center (timeline.reverseGeocodeUrl), one request at a time.
     */
    async lookupAddresses() {
      const { reverseGeocodeUrl: template, reverseGeocodeDelay } =
        this.$config.timeline;
      if (!template) return;
      const run = ++this.geocodeRun;
      const pending = this.segments
        .filter((s) => s.type === "stay" && !s.place)
        .map((s) => s.center)
        .filter((c) => !(coordinateKey(c) in addressCache));
      for (const center of pending) {
        const key = coordinateKey(center);
        if (run !== this.geocodeRun) return;
        if (key in addressCache) continue;
        const [lat, lon] = key.split(",");
        const url = template.replace("{lat}", lat).replace("{lon}", lon);
        try {
          const response = await fetch(url, {
            headers: { Accept: "application/json" },
          });
          if (response.ok) {
            addressCache[key] = addressLabel(await response.json());
          } else {
            log(
              "TIMELINE",
              `Reverse geocoding ${key}: HTTP ${response.status}`
            );
          }
        } catch (error) {
          log("TIMELINE", error);
        }
        if (key in addressCache)
          this.$set(this.addresses, key, addressCache[key]);
        await sleep(reverseGeocodeDelay);
      }
    },
    formatCoordinate({ lat, lng }) {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },
    dotOpacity(count) {
      return 0.35 + 0.65 * Math.min(1, count / this.maxCount);
    },
    selectDay(date) {
      const day = moment(date).startOf("day");
      this.setTimelineHighlight(null);
      this.setDateTimeRange({
        start: toUtc(day),
        end: toUtc(day.clone().endOf("day").milliseconds(0)),
      });
    },
    shiftDay(delta) {
      this.selectDay(this.day.clone().add(delta, "days"));
    },
    shiftMonth(delta) {
      this.month = this.month.clone().add(delta, "months");
    },
    toggleJump() {
      this.jumpOpen = !this.jumpOpen;
      this.jumpYear = this.month.year();
    },
    pickMonth(index) {
      this.month = moment({ year: this.jumpYear, month: index, day: 1 });
      this.jumpOpen = false;
    },
    goToDate(value) {
      const date = moment(value, "YYYY-MM-DD", true);
      if (!date.isValid()) return;
      this.selectDay(moment.min(date, this.today));
      this.jumpOpen = false;
    },
    goToday() {
      this.selectDay(this.today);
      this.jumpOpen = false;
    },
    /**
     * Arrow keys move the selected day, Shift + arrows by a month, unless the
     * key is meant for a form field or the map.
     */
    onKeydown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (
        target &&
        target.closest &&
        target.closest("input, select, textarea, .leaflet-container")
      ) {
        return;
      }
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      const next = this.day
        .clone()
        .add(delta, event.shiftKey ? "months" : "days");
      if (next.isAfter(this.today, "day")) return;
      this.selectDay(next);
    },
    close() {
      this.setTimelineOpen(false);
    },
    focus(segment) {
      const latLngs =
        segment.type === "stay" ? [segment.center] : segment.latLngs;
      this.setTimelineHighlight(latLngs);
      this.$root.$emit("fitBounds", latLngs);
    },
    /** Load the selected month once to mark days that have data. */
    async loadMonth() {
      if (this.monthAbortController) this.monthAbortController.abort();
      this.monthCounts = {};
      if (!this.target) return;
      const controller = new AbortController();
      this.monthAbortController = controller;
      const { user, device } = this.target;
      try {
        const locations = await api.getUserDeviceLocationHistory(
          user,
          device,
          toUtc(this.month),
          toUtc(this.month.clone().endOf("month").milliseconds(0)),
          { signal: controller.signal }
        );
        if (!controller.signal.aborted)
          this.monthCounts = countByDay(locations);
      } catch (error) {
        if (!controller.signal.aborted) log("TIMELINE", error);
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.day-timeline {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  width: 360px;
  max-width: 100%;
  overflow-y: auto;
  color: var(--color-text);
  background: var(--color-background);
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.15);

  &.day-timeline-sm {
    top: 40%;
    left: 0;
    width: auto;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.15);
  }
}

.day-timeline-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-separator);
}

.day-timeline-title {
  flex: 1;
  text-align: center;
}

.button.button-flat.button-icon {
  color: var(--color-text);

  &:hover:not(:disabled),
  &:focus:not(:disabled) {
    background: var(--color-separator);
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
}

.day-timeline-calendar {
  padding: 8px 16px 12px;
  border-bottom: 1px solid var(--color-separator);
}

.calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: bold;
}

.button.button-flat.calendar-toggle {
  padding: 4px 10px;
  font-size: 13px;
  font-weight: normal;
  color: var(--color-primary);
  border: 1px solid var(--color-separator);
}

.button.button-flat.calendar-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-weight: bold;
  color: var(--color-text);

  &:hover,
  &[aria-expanded="true"] {
    background: var(--color-separator);
  }
}

.calendar-jump {
  padding: 6px 0 2px;
}

.jump-year {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  select {
    font: inherit;
    font-weight: bold;
    padding: 4px 8px;
    color: var(--color-text);
    background: var(--color-background);
    border: 1px solid var(--color-separator);
    border-radius: 6px;
  }
}

.jump-months {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin: 8px 0;
}

.jump-month {
  padding: 8px 0;
  font: inherit;
  font-size: 14px;
  color: inherit;
  background: none;
  border: 1px solid var(--color-separator);
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-separator);
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }

  &.jump-month-current {
    color: var(--color-primary-text);
    background: var(--color-primary);
    border-color: var(--color-primary);
  }
}

.jump-date {
  display: flex;
  gap: 8px;

  input {
    flex: 1;
    font: inherit;
    padding: 6px 8px;
    color: var(--color-text);
    background: var(--color-background);
    border: 1px solid var(--color-separator);
    border-radius: 6px;
  }
}

.button.button-flat.jump-today {
  color: var(--color-primary);
  border: 1px solid var(--color-separator);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  text-align: center;
}

.calendar-weekday {
  padding: 4px 0;
  font-size: 12px;
  opacity: 0.6;
}

.calendar-day {
  position: relative;
  padding: 6px 0 10px;
  font: inherit;
  font-size: 14px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-separator);
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }

  &.calendar-day-outside {
    opacity: 0.45;
  }

  &.calendar-day-today {
    font-weight: bold;
  }

  &.calendar-day-selected {
    color: var(--color-primary-text);
    background: var(--color-primary);

    .calendar-dot {
      background: var(--color-primary-text);
    }
  }
}

.calendar-dot {
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 5px;
  height: 5px;
  margin-left: -2.5px;
  border-radius: 50%;
  background: var(--color-primary);
}

.day-timeline-hint {
  margin: 0;
  padding: 24px 16px;
  text-align: center;
  opacity: 0.7;
}

.day-timeline-segments {
  margin: 0;
  padding: 8px 0 16px;
  list-style: none;
}

.segment-button {
  display: grid;
  grid-template-columns: 64px 24px 1fr;
  align-items: start;
  width: 100%;
  padding: 0 16px;
  font: inherit;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--color-separator);
  }
}

.segment-time {
  padding: 10px 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.segment-marker {
  position: relative;
  display: flex;
  justify-content: center;
  align-self: stretch;
  padding-top: 11px;
  color: var(--color-primary);

  // The vertical line connecting the day
  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    border-left: 2px solid var(--color-separator);
  }

  .feather {
    position: relative;
    background: var(--color-background);
  }
}

.segment-move .segment-marker::before {
  border-left-style: dashed;
}

.segment-body {
  display: flex;
  flex-direction: column;
  padding: 8px 0 10px 8px;
  min-width: 0;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  small {
    opacity: 0.7;
  }
}

.segment-move .segment-body {
  font-size: 14px;
  opacity: 0.85;
}
</style>
