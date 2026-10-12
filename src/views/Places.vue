<template>
  <div class="places-view">
    <div class="places-intro">
      <h1>{{ $t("Places") }}</h1>
      <p>{{ $t("The places you visited, and when you were there.") }}</p>
      <p v-if="totals" class="places-totals">
        {{ $t("{places} places · {visits} visits", totals) }} · {{ timezone }}
      </p>
    </div>
    <div v-if="configured" class="places-layout">
      <section class="places-catalog" :aria-label="$t('Visited places')">
        <form class="places-filters" @submit.prevent="load()">
          <input
            v-model="query"
            type="search"
            :aria-label="$t('Search places')"
            :placeholder="$t('Search places')"
            maxlength="200"
          />
          <button class="button button-primary">{{ $t("Search") }}</button>
          <select
            v-model="sort"
            :aria-label="$t('Sort places')"
            @change="load()"
          >
            <option value="recent">{{ $t("Most recent") }}</option>
            <option value="visits">{{ $t("Most visited") }}</option>
            <option value="name">{{ $t("Name") }}</option>
          </select>
        </form>
        <p v-if="error" role="alert">
          {{ error }}
          <button class="button" @click="load()">{{ $t("Retry") }}</button>
        </p>
        <p v-else-if="loading && !places.length" role="status">
          {{ $t("Loading places...") }}
        </p>
        <p v-else-if="!places.length">{{ $t("No places found.") }}</p>
        <ol class="places-list">
          <li v-for="place in places" :key="place.key">
            <button
              :aria-pressed="selected === place.key ? 'true' : 'false'"
              :class="{ selected: selected === place.key }"
              @click="select(place.key)"
            >
              <strong>{{ place.name }}</strong>
              <span>
                {{ $t("{count} visits", { count: place.visitCount }) }} ·
                {{ $t("Last: {date}", { date: date(place.lastVisit) }) }}
              </span>
              <small v-if="!place.named">
                {{ place.lat.toFixed(4) }}, {{ place.lon.toFixed(4) }}
              </small>
            </button>
          </li>
        </ol>
        <button
          v-if="nextOffset !== null"
          class="button"
          :disabled="loading"
          @click="load(nextOffset)"
        >
          {{ loading ? $t("Loading...") : $t("More places") }}
        </button>
        <p class="places-note">
          {{ $t("Unnamed places show coordinates. Open a day to name them.") }}
        </p>
      </section>
      <section
        ref="history"
        class="places-history"
        :aria-label="$t('Visit history')"
      >
        <PlaceVisits
          v-if="selected"
          :key="selected"
          :place-key="selected"
          :api-url="$config.timeline.placeVisitsUrl"
          :places-url="$config.timeline.placesUrl"
        />
        <p v-else class="places-empty">
          {{ $t("Choose a place to see its visits.") }}
        </p>
      </section>
    </div>
    <p v-else>{{ $t("Places is not configured for this recorder.") }}</p>
  </div>
</template>

<script>
import moment from "moment";
import PlaceVisits from "@/components/PlaceVisits.vue";

export default {
  name: "PlacesView",
  components: { PlaceVisits },
  data() {
    return {
      places: [],
      totals: null,
      total: 0,
      nextOffset: null,
      query: "",
      sort: "recent",
      loading: false,
      error: "",
      controller: null,
    };
  },
  computed: {
    selected() {
      return typeof this.$route.query.place === "string"
        ? this.$route.query.place
        : "";
    },
    configured() {
      return (
        this.$config.timeline.placesUrl &&
        this.$config.timeline.placesApiUrl &&
        this.$config.timeline.placeVisitsUrl
      );
    },
    timezone() {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    },
  },
  created() {
    if (this.configured) this.load();
  },
  beforeDestroy() {
    if (this.controller) this.controller.abort();
  },
  methods: {
    date(tst) {
      return moment.unix(tst).format("ll");
    },
    select(key) {
      this.$router.replace({ query: { place: key } }).catch(() => {});
      if (this.$mq === "sm")
        this.$nextTick(() =>
          this.$refs.history.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        );
    },
    async load(offset = 0) {
      if (this.controller) this.controller.abort();
      const controller = new AbortController();
      this.controller = controller;
      this.loading = true;
      this.error = "";
      if (!offset) {
        this.places = [];
        this.nextOffset = null;
      }
      try {
        const url = new URL(
          this.$config.timeline.placesApiUrl,
          window.location.href
        );
        url.searchParams.set("q", this.query.trim());
        url.searchParams.set("sort", this.sort);
        url.searchParams.set("offset", offset);
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || this.$t("Could not load places"));
        if (controller.signal.aborted) return;
        const all = offset ? [...this.places, ...body.places] : body.places;
        this.places = all.filter(
          (p, i) => all.findIndex((v) => v.key === p.key) === i
        );
        this.total = body.total;
        this.totals = body.totals;
        this.nextOffset = body.nextOffset;
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
.places-view {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 24px;
  background: var(--color-background);
  color: var(--color-text);
}
.places-intro,
.places-layout {
  max-width: 1180px;
  margin: 0 auto;
}
.places-intro h1 {
  margin: 0 0 8px;
  font-size: 26px;
}
.places-intro p {
  margin: 6px 0;
}
.places-totals,
.places-note {
  font-size: 13px;
  opacity: 0.7;
}
.places-layout {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 24px;
  margin-top: 22px;
  align-items: start;
}
.places-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.places-filters input {
  flex: 1;
  min-width: 140px;
}
.places-filters input,
.places-filters select {
  padding: 9px 10px;
  font: inherit;
  color: inherit;
  border: 1px solid var(--color-separator);
  border-radius: 6px;
  background: var(--color-background);
}
.places-filters select {
  width: 100%;
}
.places-list {
  list-style: none;
  padding: 0;
  margin: 14px 0;
}
.places-list button {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px;
  font: inherit;
  text-align: left;
  color: inherit;
  background: var(--color-background);
  border: 1px solid var(--color-separator);
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 8px;
}
.places-list button.selected {
  border-color: var(--color-primary);
  box-shadow: inset 3px 0 var(--color-primary);
}
.places-list span,
.places-list small {
  font-size: 12px;
  opacity: 0.7;
}
.places-empty {
  border: 1px dashed var(--color-separator);
  border-radius: 6px;
  padding: 40px 20px;
  text-align: center;
  opacity: 0.7;
}
@media (max-width: 700px) {
  .places-view {
    padding: 16px;
  }
  .places-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
