<template>
  <section class="place-editor" :aria-label="$t('Edit place')">
    <strong>{{ $t("Choose the place you visited") }}</strong>
    <form class="place-search" @submit.prevent="search">
      <div class="place-search-kind">
        <label>
          <input
            v-model="kind"
            type="radio"
            :name="inputId + '-kind'"
            value="place"
            :disabled="saving"
            @change="clearResults"
          />
          {{ $t("Place name") }}
        </label>
        <label>
          <input
            v-model="kind"
            type="radio"
            :name="inputId + '-kind'"
            value="address"
            :disabled="saving"
            @change="clearResults"
          />
          {{ $t("Address") }}
        </label>
      </div>
      <label :for="inputId">{{ $t("Place name or address") }}</label>
      <div class="place-search-fields">
        <input
          :id="inputId"
          ref="query"
          v-model="query"
          type="search"
          maxlength="200"
          :placeholder="$t('Search name and suburb')"
          :disabled="saving"
          @input="clearResults"
        />
        <button
          type="submit"
          class="button button-primary"
          :disabled="busy || query.trim().length < 3"
        >
          {{ searching ? $t("Searching...") : $t("Search") }}
        </button>
      </div>
    </form>
    <p v-if="error" class="place-error" role="alert">{{ error }}</p>
    <p v-else-if="searched && !results.length" role="status">
      {{ $t("No mapped places found. Try the street or suburb.") }}
    </p>
    <ul v-if="results.length" class="place-results">
      <li v-for="place in results" :key="`${place.osmType}/${place.osmId}`">
        <button
          class="place-result"
          :class="{ selected: selected === place }"
          :aria-pressed="selected === place ? 'true' : 'false'"
          :disabled="saving"
          @click="select(place)"
        >
          <strong>{{ place.name }}</strong>
          <small>{{ place.address }}</small>
          <small>
            {{
              $t("{distance} from recorded point", {
                distance: distance(place),
              })
            }}
          </small>
        </button>
        <a :href="place.mapUrl" target="_blank" rel="noopener noreferrer">
          {{ $t("View on map") }}
        </a>
      </li>
    </ul>
    <div class="place-actions">
      <button
        class="button button-primary"
        :disabled="busy || !selected"
        @click="save"
      >
        {{ saving ? $t("Saving...") : $t("Save place") }}
      </button>
      <button
        v-if="corrected"
        class="button button-flat"
        :disabled="busy"
        @click="reset"
      >
        {{ $t("Use detected place") }}
      </button>
      <button
        class="button button-flat"
        :disabled="saving"
        @click="$emit('cancel')"
      >
        {{ $t("Cancel") }}
      </button>
    </div>
    <small class="place-attribution">
      ©
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >
        OpenStreetMap contributors
      </a>
    </small>
  </section>
</template>

<script>
import { humanReadableDistance } from "@/util";

export default {
  props: {
    device: { type: String, required: true },
    tst: { type: Number, required: true },
    currentName: { type: String, default: "" },
    corrected: { type: Boolean, default: false },
    searchUrl: { type: String, required: true },
    correctionUrl: { type: String, required: true },
  },
  data() {
    return {
      query: this.currentName,
      kind: "place",
      results: [],
      selected: null,
      searched: false,
      searching: false,
      saving: false,
      error: "",
      controller: null,
    };
  },
  computed: {
    busy() {
      return this.searching || this.saving;
    },
    inputId() {
      return `place-query-${this._uid}`;
    },
  },
  mounted() {
    this.$refs.query.focus();
    this.$refs.query.select();
  },
  beforeDestroy() {
    if (this.controller) this.controller.abort();
  },
  methods: {
    distance(place) {
      return humanReadableDistance(Math.round(place.distance));
    },
    clearResults() {
      if (this.controller) this.controller.abort();
      this.controller = null;
      this.searching = false;
      this.results = [];
      this.selected = null;
      this.searched = false;
      this.error = "";
    },
    select(place) {
      this.selected = place;
      this.$emit("preview", place);
    },
    async search() {
      if (this.busy || this.query.trim().length < 3) return;
      this.clearResults();
      const controller = new AbortController();
      this.controller = controller;
      this.searching = true;
      try {
        const url = new URL(this.searchUrl, window.location.href);
        url.searchParams.set("q", this.query.trim());
        url.searchParams.set("kind", this.kind);
        url.searchParams.set("device", this.device);
        url.searchParams.set("tst", this.tst);
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || this.$t("Search failed"));
        if (!controller.signal.aborted) {
          this.results = body.results;
          this.searched = true;
        }
      } catch (error) {
        if (!controller.signal.aborted) this.error = error.message;
      } finally {
        if (this.controller === controller) this.searching = false;
      }
    },
    save() {
      if (!this.selected || this.busy) return;
      return this.persist("POST", {
        osmType: this.selected.osmType,
        osmId: this.selected.osmId,
      });
    },
    reset() {
      if (!this.busy) return this.persist("DELETE", {});
    },
    async persist(method, selection) {
      this.saving = true;
      this.error = "";
      const controller = new AbortController();
      this.controller = controller;
      try {
        const response = await fetch(this.correctionUrl, {
          method,
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device: this.device,
            tst: this.tst,
            ...selection,
          }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || this.$t("Could not save place"));
        if (!controller.signal.aborted) this.$emit("saved", body.location);
      } catch (error) {
        if (!controller.signal.aborted) this.error = error.message;
      } finally {
        if (!controller.signal.aborted) this.saving = false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.place-editor {
  margin: 0 12px 12px;
  padding: 14px;
  border: 1px solid var(--color-separator);
  border-radius: 6px;
  font-size: 13px;
  background: var(--color-background);

  input {
    width: 100%;
    min-width: 0;
    padding: 8px;
    font: inherit;
    color: inherit;
    background: var(--color-background);
    border: 1px solid var(--color-separator);
    border-radius: 4px;
  }

  a {
    color: var(--color-primary);
  }
  button {
    font: inherit;
    flex-shrink: 0;
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
  .button-flat {
    color: var(--color-text);
  }
}
.place-search {
  margin: 12px 0;
}
.place-search-kind {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input {
    width: auto;
  }
}
.place-search-fields {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  input {
    flex: 1;
    width: 0;
  }
}
.place-error {
  color: var(--color-error, #b42318);
}
.place-results {
  padding: 0;
  margin: 12px 0;
  list-style: none;
}
.place-results li {
  margin: 8px 0;
}
.place-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 10px;
  color: inherit;
  text-align: left;
  background: var(--color-background);
  border: 1px solid var(--color-separator);
  border-radius: 4px;
  cursor: pointer;

  &.selected {
    border-color: var(--color-primary);
  }
  small {
    opacity: 0.75;
  }
}
.place-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.place-attribution {
  display: block;
  margin-top: 12px;
  opacity: 0.7;
}
</style>
