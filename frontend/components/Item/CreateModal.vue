<template>
  <BaseModal v-model="modal">
    <template #title> Create Item </template>
    <form @submit.prevent="create()">
      <LocationSelector v-model="form.location" />
      <div class="flex items-start justify-between gap-3 mb-2">
        <p class="text-xs text-base-content/70">Keep it simple — AI can prefill from photos.</p>
        <BaseButton size="sm" :loading="aiLoading" :disabled="loading" type="button" @click="analyzeWithAI">
          <template #icon>
            <MdiAutoFix class="h-4 w-4" />
          </template>
          AI Prefill
        </BaseButton>
      </div>

      <div class="card bg-base-200/60 border border-base-300 mb-4">
        <div class="card-body p-3 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs text-base-content/70">Add one or more photos to help auto-fill details.</p>
            <button class="btn btn-xs btn-ghost" type="button" @click="openFilePicker">
              <MdiCamera class="h-4 w-4 mr-1" />
              Add photos
            </button>
            <input ref="photoInput" hidden type="file" accept="image/*" multiple @change="onPhotoChange" />
          </div>

          <div v-if="photos.length > 0" class="flex flex-wrap gap-2">
            <div
              v-for="photo in photos"
              :key="photo.id"
              class="group relative h-14 w-14 rounded-md overflow-hidden border border-base-300"
            >
              <img :src="photo.preview" alt="item photo" class="h-full w-full object-cover" />
              <button
                class="btn btn-circle btn-xs absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                type="button"
                @click="removePhoto(photo.id)"
              >
                <MdiClose class="h-3 w-3" />
              </button>
            </div>
          </div>

          <p v-if="aiSummary" class="text-xs text-base-content/80">{{ aiSummary }}</p>
        </div>
      </div>

      <FormTextField ref="nameInput" v-model="form.name" :trigger-focus="focused" :autofocus="true" label="Item Name" />
      <FormTextArea v-model="form.description" label="Item Description" />
      <FormMultiselect v-model="form.labels" label="Labels" :items="labels ?? []" />
      <div class="modal-action">
        <div class="flex justify-center">
          <BaseButton class="rounded-r-none" :loading="loading" type="submit">
            <template #icon>
              <MdiPackageVariant class="swap-off h-5 w-5" />
              <MdiPackageVariantClosed class="swap-on h-5 w-5" />
            </template>
            Create
          </BaseButton>
          <div class="dropdown dropdown-top">
            <label tabindex="0" class="btn rounded-l-none rounded-r-xl">
              <MdiChevronDown class="h-5 w-5" name="mdi-chevron-down" />
            </label>
            <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-64 right-0">
              <li>
                <button type="button" @click="create(false)">Create and Add Another</button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </form>
    <p class="text-sm text-center mt-4">
      use <kbd class="kbd kbd-xs">Shift</kbd> + <kbd class="kbd kbd-xs"> Enter </kbd> to create and add another
    </p>
  </BaseModal>
</template>

<script setup lang="ts">
  import type { ItemCreate, LabelOut, LocationOut } from "~~/lib/api/types/data-contracts";
  import { useLabelStore } from "~~/stores/labels";
  import { useLocationStore } from "~~/stores/locations";
  import MdiPackageVariant from "~icons/mdi/package-variant";
  import MdiPackageVariantClosed from "~icons/mdi/package-variant-closed";
  import MdiChevronDown from "~icons/mdi/chevron-down";
  import MdiAutoFix from "~icons/mdi/auto-fix";
  import MdiCamera from "~icons/mdi/camera";
  import MdiClose from "~icons/mdi/close";
  import { AttachmentTypes } from "~~/lib/api/types/non-generated";

  const props = defineProps({
    modelValue: {
      type: Boolean,
      required: true,
    },
  });

  type PendingPhoto = {
    id: string;
    file: File;
    preview: string;
  };

  const api = useUserApi();
  const toast = useNotifier();
  const aiSettings = useAISettings();
  const aiAgent = useOpenAIItemAgent();

  const locationsStore = useLocationStore();
  const locations = computed(() => locationsStore.allLocations);

  const labelStore = useLabelStore();
  const labels = computed(() => labelStore.labels);

  const route = useRoute();

  const labelId = computed(() => {
    if (route.fullPath.includes("/label/")) {
      return route.params.id;
    }
    return null;
  });

  const locationId = computed(() => {
    if (route.fullPath.includes("/location/")) {
      return route.params.id;
    }
    return null;
  });

  const nameInput = ref<HTMLInputElement | null>(null);
  const photoInput = ref<HTMLInputElement | null>(null);

  const modal = useVModel(props, "modelValue");
  const loading = ref(false);
  const aiLoading = ref(false);
  const focused = ref(false);
  const aiSummary = ref("");
  const photos = ref<PendingPhoto[]>([]);
  const form = reactive({
    location: locations.value && locations.value.length > 0 ? locations.value[0] : ({} as LocationOut),
    name: "",
    description: "",
    color: "", // Future!
    labels: [] as LabelOut[],
  });

  const { shift } = useMagicKeys();

  whenever(
    () => modal.value,
    () => {
      focused.value = true;

      if (locationId.value) {
        const found = locations.value.find(l => l.id === locationId.value);
        if (found) {
          form.location = found;
        }
      }

      if (labelId.value) {
        form.labels = labels.value.filter(l => l.id === labelId.value);
      }

      if (!aiSettings.hasApiKey.value) {
        aiSettings.promptForApiKey("Add your OpenAI API key to enable AI item prefill from photos.");
      }
    }
  );

  function openFilePicker() {
    photoInput.value?.click();
  }

  function onPhotoChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files || []);

    const next = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));

    photos.value = [...photos.value, ...next];
    target.value = "";
  }

  function removePhoto(photoId: string) {
    const found = photos.value.find(x => x.id === photoId);
    if (found) {
      URL.revokeObjectURL(found.preview);
    }

    photos.value = photos.value.filter(x => x.id !== photoId);
  }

  async function analyzeWithAI() {
    if (!photos.value.length) {
      toast.error("Add at least one photo first");
      return;
    }

    if (!aiSettings.hasApiKey.value) {
      const ok = aiSettings.promptForApiKey("Enter your OpenAI API key to analyze these photos.");
      if (!ok) {
        return;
      }
    }

    aiLoading.value = true;
    aiSummary.value = "";

    try {
      const result = await aiAgent.analyzeFromImages({
        apiKey: aiSettings.apiKey.value,
        files: photos.value.map(x => x.file),
        listExistingItems: async ({ query, page = 1 }) => {
          const { data, error } = await api.items.getAll({
            q: query,
            page,
            pageSize: 20,
            orderBy: "name",
          });

          if (error || !data) {
            return { items: [], hasMore: false };
          }

          return {
            items: data.items.map(item => ({
              id: item.id,
              name: item.name,
              description: item.description,
            })),
            hasMore: data.page * data.pageSize < data.total,
          };
        },
        getItemDetails: async id => {
          if (!id) {
            return null;
          }

          const { data } = await api.items.get(id);
          return data || null;
        },
      });

      form.name = result.prefill.name || form.name;
      form.description = result.prefill.description || form.description;

      if (result.shouldReuseExisting && result.reuseCandidate) {
        aiSummary.value = `Looks like "${result.reuseCandidate.name}" may already exist. ${result.reuseCandidate.reason}`;
      } else if (result.extractedDetails.length > 0) {
        aiSummary.value = `AI extracted: ${result.extractedDetails.slice(0, 3).join(" • ")}`;
      } else {
        aiSummary.value = "AI prefill complete.";
      }

      toast.success("AI prefill applied");
    } catch (error) {
      console.error(error);
      toast.error("AI prefill failed");
    } finally {
      aiLoading.value = false;
    }
  }

  async function create(close = true) {
    if (!form.location) {
      return;
    }

    if (shift.value) {
      close = false;
    }

    loading.value = true;

    const out: ItemCreate = {
      parentId: null,
      name: form.name,
      description: form.description,
      locationId: form.location.id as string,
      labelIds: form.labels.map(l => l.id) as string[],
    };

    const { error, data } = await api.items.create(out);
    if (error) {
      loading.value = false;
      toast.error("Couldn't create item");
      return;
    }

    if (photos.value.length > 0) {
      for (const photo of photos.value) {
        // fire serially to keep UI predictable and avoid rate spikes
        await api.items.attachments.add(data.id, photo.file, photo.file.name, AttachmentTypes.Photo);
      }
    }

    toast.success("Item created");

    for (const photo of photos.value) {
      URL.revokeObjectURL(photo.preview);
    }

    // Reset
    form.name = "";
    form.description = "";
    form.color = "";
    photos.value = [];
    aiSummary.value = "";
    focused.value = false;
    loading.value = false;

    if (close) {
      modal.value = false;
      navigateTo(`/item/${data.id}`);
    }
  }
</script>
