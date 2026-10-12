<template>
  <section class="place-visits" :aria-label="$t('Past visits')">
    <p v-if="error" class="visit-error" role="alert">
      {{ error }}
      <button class="button button-flat" @click="load()">
        {{ $t("Retry") }}
      </button>
    </p>
    <p v-else-if="loading && !data" role="status">
      {{ $t("Loading visits...") }}
    </p>
    <template v-if="data && data.place">
      <div class="visit-heading">
        <strong>{{ data.place.name }}</strong>
        <span>{{ $t("{count} visits", { count: data.total }) }}</span>
      </div>
      <div class="visit-links">
        <a :href="data.place.mapUrl" target="_blank" rel="noopener noreferrer">
          {{ $t("View on map") }}
        </a>
        <a
          v-if="compact"
          :href="fullHistoryUrl(data.place.key)"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ $t("Open in Places") }}
        </a>
      </div>
      <ol class="visit-list">
        <li
          v-for="visit in data.visits"
          :key="`${visit.device}/${visit.start}/${visit.source}`"
        >
          <div>
            <strong>{{ date(visit.start) }}</strong>
            <span>
              {{ visit.estimated ? "~" : "" }}{{ time(visit.start) }} –
              {{ visit.ongoing ? $t("last seen") : "" }}{{ end(visit) }}
            </span>
            <small>
              {{ humanReadableDuration(visit.end - visit.start) }} ·
              {{
                visit.source === "google" ? $t("Google Timeline") : visit.device
              }}
            </small>
          </div>
          <a :href="dayUrl(visit)" target="_blank" rel="noopener noreferrer">
            {{ $t("Open day") }}
          </a>
        </li>
      </ol>
      <button
        v-if="data.nextOffset !== null"
        class="button button-primary"
        :disabled="loading"
        @click="load(data.nextOffset)"
      >
        {{ loading ? $t("Loading...") : $t("Older visits") }}
      </button>
      <p class="visit-note">
        {{ $t("Times marked ~ are estimated from location points.") }}
      </p>
      <details v-if="data.nearby && data.nearby.length" class="nearby-visits">
        <summary>{{ $t("Nearby recorded places") }}</summary>
        <p>
          {{ $t("Unnamed nearby locations are listed separately.") }}
        </p>
        <a
          v-for="place in data.nearby"
          :key="place.key"
          :href="fullHistoryUrl(place.key)"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ place.name }} ·
          {{ $t("{count} visits", { count: place.visitCount }) }}
          <small>{{ place.lat.toFixed(4) }}, {{ place.lon.toFixed(4) }}</small>
        </a>
      </details>
    </template>
    <p v-else-if="data">{{ $t("No recorded visits for this stay yet.") }}</p>
  </section>
</template>

<script>
import moment from "moment";
import { humanReadableDuration } from "@/timeline";
import { DATE_TIME_FORMAT } from "@/constants";

export default {
  props: {
    apiUrl: { type: String, required: true },
    placesUrl: { type: String, required: true },
    placeKey: { type: String, default: "" },
    device: { type: String, default: "" },
    tst: { type: Number, default: 0 },
    compact: { type: Boolean, default: false },
  },
  data() {
    return { data: null, loading: false, error: "", controller: null };
  },
  computed: {
    requestKey() {
      return `${this.placeKey}/${this.device}/${this.tst}`;
    },
  },
  watch: {
    requestKey: {
      immediate: true,
      handler() {
        this.load();
      },
    },
  },
  beforeDestroy() {
    if (this.controller) this.controller.abort();
  },
  methods: {
    humanReadableDuration,
    date(tst) {
      return moment.unix(tst).format("ll");
    },
    time(tst) {
      return moment.unix(tst).format("LT");
    },
    end(visit) {
      return moment.unix(visit.start).isSame(moment.unix(visit.end), "day")
        ? this.time(visit.end)
        : `${this.date(visit.end)} ${this.time(visit.end)}`;
    },
    dayUrl(visit) {
      const url = new URL(this.$config.router.basePath, window.location.origin);
      const day = moment.unix(visit.start).startOf("day");
      url.searchParams.set("start", day.clone().utc().format(DATE_TIME_FORMAT));
      url.searchParams.set(
        "end",
        day.clone().endOf("day").utc().format(DATE_TIME_FORMAT)
      );
      url.searchParams.set("device", visit.device);
      if (visit.user) url.searchParams.set("user", visit.user);
      url.searchParams.set("timeline", "1");
      return url.href;
    },
    fullHistoryUrl(key) {
      const url = new URL(this.placesUrl, window.location.href);
      url.searchParams.set("place", key);
      return url.href;
    },
    async load(offset = 0) {
      if (this.controller) this.controller.abort();
      const controller = new AbortController();
      this.controller = controller;
      this.loading = true;
      this.error = "";
      if (!offset) this.data = null;
      try {
        const url = new URL(this.apiUrl, window.location.href);
        if (this.placeKey) url.searchParams.set("key", this.placeKey);
        else {
          url.searchParams.set("device", this.device);
          url.searchParams.set("tst", this.tst);
        }
        url.searchParams.set("offset", offset);
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || this.$t("Could not load visits"));
        if (controller.signal.aborted) return;
        if (offset && this.data) {
          const visits = [...this.data.visits, ...body.visits];
          const seen = new Set();
          body.visits = visits.filter((v) => {
            const key = `${v.device}/${v.start}/${v.source}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          body.nearby = this.data.nearby;
        }
        this.data = body;
      } catch (error) {
        if (!controller.signal.aborted) this.error = error.message;
      } finally {
        if (!controller.signal.aborted) this.loading = false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.place-visits {
  padding: 14px;
  border: 1px solid var(--color-separator);
  border-radius: 6px;
  font-size: 13px;
  background: var(--color-background);
}
.visit-heading {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  flex-wrap: wrap;
}
.visit-heading span,
.visit-note,
.visit-list small {
  opacity: 0.7;
}
.visit-links {
  display: flex;
  gap: 14px;
  margin: 8px 0;
}
.place-visits a {
  color: var(--color-primary);
}
.visit-list {
  padding: 0;
  margin: 12px 0;
  list-style: none;
}
.visit-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--color-separator);
}
.visit-list li > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.visit-list li > a {
  white-space: nowrap;
}
.place-visits .button-flat {
  color: var(--color-text);
}
.nearby-visits {
  border-top: 1px solid var(--color-separator);
  padding-top: 12px;
  margin-top: 12px;
}
.nearby-visits summary {
  cursor: pointer;
}
.nearby-visits a {
  display: block;
  margin: 12px 0;
}
.nearby-visits small {
  display: block;
}
</style>
