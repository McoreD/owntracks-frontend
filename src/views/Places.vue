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
      <section
        ref="catalog"
        class="places-catalog"
        :aria-label="$t('Visited places')"
      >
        <form class="places-filters" @submit.prevent="search()">
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
            <option value="name">{{ $t("Alphabetical") }}</option>
            <option value="recent">{{ $t("Most recent") }}</option>
            <option value="visits">{{ $t("Most visited") }}</option>
          </select>
        </form>
        <nav class="places-alphabet" :aria-label="$t('Browse by letter')">
          <button
            v-for="letter in letters"
            :key="letter || 'all'"
            :class="{ active: group === letter, unnamed: letter === 'unnamed' }"
            :disabled="loading || (letter !== '' && !groupCount(letter))"
            :aria-pressed="group === letter ? 'true' : 'false'"
            :title="$t('{count} places', { count: groupCount(letter) })"
            @click="browse(letter)"
          >
            {{ letter === "unnamed" ? $t("Unnamed") : letter || $t("All") }}
            <small v-if="letter === 'unnamed'">{{ groupCount(letter) }}</small>
          </button>
        </nav>
        <nav v-if="total" class="places-pagination" :aria-label="$t('Pages')">
          <p aria-live="polite">
            {{ $t("Showing {from}–{to} of {total}", range) }}
          </p>
          <div class="places-page-buttons">
            <button
              class="button"
              :disabled="loading || offset === 0"
              @click="pageTo(Math.max(0, offset - pageSize))"
            >
              {{ $t("Previous") }}
            </button>
            <span>
              {{ $t("Page {page} of {pages}", { page, pages: pageCount }) }}
            </span>
            <button
              class="button"
              :disabled="loading || nextOffset === null"
              @click="pageTo(nextOffset)"
            >
              {{ $t("Next") }}
            </button>
          </div>
          <form
            v-if="pageCount > 1"
            class="places-page-jump"
            @submit.prevent="jump()"
          >
            <label for="places-page">{{ $t("Go to page") }}</label>
            <input
              id="places-page"
              v-model.number="pageInput"
              type="number"
              min="1"
              :max="pageCount"
              :disabled="loading"
              required
            />
            <button class="button" :disabled="loading">{{ $t("Go") }}</button>
          </form>
        </nav>
        <p v-if="error" role="alert">
          {{ error }}
          <button class="button" @click="load()">{{ $t("Retry") }}</button>
        </p>
        <p v-else-if="loading && !places.length" role="status">
          {{ $t("Loading places...") }}
        </p>
        <p v-else-if="!places.length">{{ $t("No places found.") }}</p>
        <ol class="places-list">
          <li v-for="(place, index) in places" :key="place.key">
            <h2
              v-if="sort === 'name' && beginsGroup(index)"
              class="places-group"
            >
              {{ groupLabel(placeGroup(place)) }}
            </h2>
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
        <nav
          v-if="pageCount > 1"
          class="places-pagination"
          :aria-label="$t('More pages')"
        >
          <div class="places-page-buttons">
            <button
              class="button"
              :disabled="loading || offset === 0"
              @click="pageTo(Math.max(0, offset - pageSize))"
            >
              {{ $t("Previous") }}
            </button>
            <span>
              {{ $t("Page {page} of {pages}", { page, pages: pageCount }) }}
            </span>
            <button
              class="button"
              :disabled="loading || nextOffset === null"
              @click="pageTo(nextOffset)"
            >
              {{ $t("Next") }}
            </button>
          </div>
        </nav>
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
      sort: "name",
      group: "",
      groups: [],
      offset: 0,
      pageSize: 40,
      pageInput: 1,
      loading: false,
      error: "",
      controller: null,
    };
  },
  computed: {
    letters() {
      return ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#", "unnamed"];
    },
    page() {
      return Math.floor(this.offset / this.pageSize) + 1;
    },
    pageCount() {
      return Math.max(1, Math.ceil(this.total / this.pageSize));
    },
    range() {
      return {
        from: this.offset + 1,
        to: this.offset + this.places.length,
        total: this.total,
      };
    },
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
    groupCount(key) {
      if (!key) return this.groups.reduce((sum, g) => sum + g.count, 0);
      return this.groups.find((g) => g.key === key)?.count || 0;
    },
    placeGroup(place) {
      if (place.group) return place.group;
      const first = place.named
        ? place.name.trim().charAt(0).toUpperCase()
        : "";
      return first ? (/^[A-Z]$/.test(first) ? first : "#") : "unnamed";
    },
    groupLabel(key) {
      return key === "unnamed"
        ? this.$t("Unnamed places")
        : key === "#"
          ? this.$t("Other names")
          : key;
    },
    beginsGroup(index) {
      return (
        index === 0 ||
        this.placeGroup(this.places[index]) !==
          this.placeGroup(this.places[index - 1])
      );
    },
    search() {
      this.group = "";
      this.load();
    },
    browse(key) {
      this.group = key;
      this.sort = "name";
      this.load();
    },
    jump() {
      const page = Math.min(
        this.pageCount,
        Math.max(1, Math.floor(Number(this.pageInput) || 1))
      );
      this.pageTo((page - 1) * this.pageSize);
    },
    pageTo(offset) {
      this.load(offset);
      this.$refs.catalog.scrollIntoView({ behavior: "smooth", block: "start" });
    },
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
      this.places = [];
      try {
        const url = new URL(
          this.$config.timeline.placesApiUrl,
          window.location.href
        );
        url.searchParams.set("q", this.query.trim());
        url.searchParams.set("sort", this.sort);
        url.searchParams.set("group", this.group);
        url.searchParams.set("limit", this.pageSize);
        url.searchParams.set("offset", offset);
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || this.$t("Could not load places"));
        if (controller.signal.aborted) return;
        this.places = body.places;
        this.total = body.total;
        this.groups = body.groups || [];
        this.totals = body.totals;
        this.nextOffset = body.nextOffset;
        this.offset = offset;
        this.pageInput = this.page;
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
.places-alphabet {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
  margin-top: 14px;
}
.places-alphabet button {
  min-height: 36px;
  border: 1px solid var(--color-separator);
  border-radius: 5px;
  font: inherit;
  color: inherit;
  background: var(--color-background);
  cursor: pointer;
}
.places-alphabet button.active {
  color: var(--color-primary-text);
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.places-alphabet button:disabled {
  opacity: 0.35;
  cursor: default;
}
.places-alphabet .unnamed {
  grid-column: 1 / -1;
}
.places-alphabet small {
  margin-left: 6px;
}
.places-group {
  font-size: 15px;
  padding: 10px 0;
}
.places-pagination {
  margin: 16px 0;
}
.places-pagination p {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 8px;
}
.places-page-buttons {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.places-page-buttons .button {
  padding: 6px 10px;
}
.places-page-buttons span {
  font-size: 12px;
}
.places-page-jump {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.places-page-jump input {
  width: 60px;
  padding: 6px;
  border: 1px solid var(--color-separator);
  border-radius: 4px;
  color: inherit;
  background: var(--color-background);
  font: inherit;
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
.places-history {
  position: sticky;
  top: 0;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
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
  .places-history {
    position: static;
    max-height: none;
    overflow-y: visible;
  }
  .places-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
