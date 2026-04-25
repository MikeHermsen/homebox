<template>
  <BaseModal v-model="modal">
    <template #title> Create Item </template>
    <form class="space-y-4" @submit.prevent="create()">
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-3 mb-2">
          <p class="text-xs text-base-content/70">
            Add photos, run AI prefill, then review before creating.
          </p>
          <button
            type="button"
            class="btn btn-sm"
            :class="{ loading: aiLoading }"
            :disabled="loading || aiLoading"
            @click.prevent.stop="analyzeWithAI"
          >
            <MdiAutoFix class="h-4 w-4" />
            AI Prefill
          </button>
        </div>

        <div class="card bg-base-200/60 border border-base-300">
          <div class="card-body p-3 space-y-2">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-base-content/70">
                Add one or more photos to help auto-fill details.
              </p>
              <button
                class="btn btn-xs btn-ghost"
                type="button"
                @click="openFilePicker"
              >
                <MdiCamera class="h-4 w-4 mr-1" />
                Add photos
              </button>
              <input
                ref="photoInput"
                hidden
                type="file"
                accept="image/*"
                multiple
                @change="onPhotoChange"
              />
            </div>

            <div v-if="photos.length > 0" class="flex flex-wrap gap-2">
              <div
                v-for="photo in photos"
                :key="photo.id"
                class="group relative h-14 w-14 rounded-md overflow-hidden border border-base-300"
              >
                <img
                  :src="photo.preview"
                  alt="item photo"
                  class="h-full w-full object-cover"
                />
                <button
                  class="btn btn-circle btn-xs absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                  type="button"
                  @click="removePhoto(photo.id)"
                >
                  <MdiClose class="h-3 w-3" />
                </button>
              </div>
            </div>

            <p v-if="aiSummary" class="text-xs text-base-content/80">
              {{ aiSummary }}
            </p>
          </div>
        </div>

        <div
          v-if="existingMatch"
          class="rounded-2xl border border-primary/30 bg-gradient-to-br from-base-100 to-base-200/80 p-4 shadow-sm"
        >
          <div class="flex flex-col gap-4 md:flex-row md:items-center">
            <img
              v-if="existingMatch.previewUrl"
              :src="existingMatch.previewUrl"
              :alt="existingMatch.item.name"
              class="h-24 w-24 rounded-xl border border-base-300 object-cover"
            />
            <div class="flex-1 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge badge-primary badge-outline">
                  {{
                    existingMatch.exact
                      ? "Exact match found"
                      : "Possible match found"
                  }}
                </span>
                <span class="text-xs text-base-content/70">
                  {{ Math.round(existingMatch.confidence * 100) }}% confidence
                </span>
              </div>

              <div>
                <p class="font-semibold leading-tight">
                  {{ existingMatch.item.name }}
                </p>
                <p class="text-sm text-base-content/70">
                  {{ existingMatch.reason }}
                </p>
              </div>

              <div class="flex flex-wrap gap-2 text-xs text-base-content/70">
                <span class="badge badge-ghost"
                  >Current qty: {{ existingMatch.item.quantity }}</span
                >
                <span
                  v-if="existingMatch.item.manufacturer"
                  class="badge badge-ghost"
                >
                  {{ existingMatch.item.manufacturer }}
                </span>
                <span
                  v-if="existingMatch.item.modelNumber"
                  class="badge badge-ghost"
                >
                  {{ existingMatch.item.modelNumber }}
                </span>
                <span
                  v-if="existingMatch.photoCount > 0"
                  class="badge badge-ghost"
                >
                  {{ existingMatch.photoCount }} saved photo{{
                    existingMatch.photoCount === 1 ? "" : "s"
                  }}
                </span>
              </div>

              <p
                v-if="existingMatch.exact"
                class="text-sm text-base-content/80"
              >
                Choose whether to add this quantity to the existing item or save
                a separate item.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-4 pb-2">
        <div class="card bg-base-200/50 border border-base-300">
          <div class="card-body p-4 space-y-4">
            <LocationSelector v-model="form.location" />
            <FormMultiselect
              v-model="form.labels"
              label="Labels"
              :items="labels ?? []"
            />
            <div class="grid gap-4 md:grid-cols-2">
              <FormTextField
                ref="nameInput"
                v-model="form.name"
                :trigger-focus="focused"
                :autofocus="true"
                label="Item Name"
              />
              <FormTextField
                v-model.number="form.quantity"
                type="number"
                min="1"
                label="Quantity"
              />
            </div>
            <FormTextArea v-model="form.description" label="Item Description" />
          </div>
        </div>

        <div class="card bg-base-200/50 border border-base-300">
          <div class="card-body p-4">
            <h4 class="font-semibold text-sm mb-3">Identification</h4>
            <div class="grid gap-4 md:grid-cols-2">
              <FormTextField
                v-model="form.serialNumber"
                label="Serial Number"
              />
              <FormTextField v-model="form.modelNumber" label="Model Number" />
              <FormTextField v-model="form.manufacturer" label="Manufacturer" />
              <FormCheckbox v-model="form.insured" label="Insured" />
            </div>
          </div>
        </div>

        <div class="card bg-base-200/50 border border-base-300">
          <div class="card-body p-4">
            <h4 class="font-semibold text-sm mb-3">Purchase</h4>
            <div class="grid gap-4 md:grid-cols-2">
              <FormTextField
                v-model="form.purchaseFrom"
                label="Purchased From"
              />
              <FormTextField
                v-model="form.purchasePrice"
                label="Purchase Price"
              />
              <FormDatePicker
                v-model="form.purchaseTime"
                label="Purchase Date"
              />
            </div>
          </div>
        </div>

        <div class="card bg-base-200/50 border border-base-300">
          <div class="card-body p-4">
            <h4 class="font-semibold text-sm mb-3">Warranty</h4>
            <div class="grid gap-4 md:grid-cols-2">
              <FormCheckbox
                v-model="form.lifetimeWarranty"
                label="Lifetime Warranty"
              />
              <FormDatePicker
                v-model="form.warrantyExpires"
                label="Warranty Expires"
              />
            </div>
            <FormTextArea
              v-model="form.warrantyDetails"
              label="Warranty Notes"
            />
          </div>
        </div>

        <div class="card bg-base-200/50 border border-base-300">
          <div class="card-body p-4">
            <h4 class="font-semibold text-sm mb-3">Sold</h4>
            <div class="grid gap-4 md:grid-cols-2">
              <FormTextField v-model="form.soldTo" label="Sold To" />
              <FormTextField v-model="form.soldPrice" label="Sold Price" />
              <FormDatePicker v-model="form.soldTime" label="Sold Date" />
            </div>
            <FormTextArea v-model="form.soldNotes" label="Sold Notes" />
          </div>
        </div>

        <div class="card bg-base-200/50 border border-base-300">
          <div class="card-body p-4">
            <h4 class="font-semibold text-sm mb-3">Extras</h4>
            <FormTextArea v-model="form.notes" label="Notes" />
          </div>
        </div>
      </div>

      <div class="modal-action">
        <div class="flex justify-center">
          <BaseButton class="rounded-r-none" :loading="loading" type="submit">
            <template #icon>
              <MdiPackageVariant class="swap-off h-5 w-5" />
              <MdiPackageVariantClosed class="swap-on h-5 w-5" />
            </template>
            {{ primaryActionLabel }}
          </BaseButton>
          <div class="dropdown dropdown-top">
            <label tabindex="0" class="btn rounded-l-none rounded-r-xl">
              <MdiChevronDown class="h-5 w-5" name="mdi-chevron-down" />
            </label>
            <ul
              tabindex="0"
              class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-64 right-0"
            >
              <li v-if="existingMatch?.exact">
                <button type="button" @click="create('merge_existing')">
                  Add Quantity to {{ existingMatch.item.name }}
                </button>
              </li>
              <li v-if="existingMatch?.exact">
                <button type="button" @click="create('new')">
                  Save as New Item
                </button>
              </li>
              <li>
                <button type="button" @click="create('new_continue')">
                  {{
                    existingMatch?.exact
                      ? "Save as New and Add Another"
                      : "Create and Add Another"
                  }}
                </button>
              </li>
              <li v-if="existingMatch">
                <button type="button" @click="clearExistingMatch">
                  Dismiss Match
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </form>
    <p class="text-sm text-center mt-4">
      use <kbd class="kbd kbd-xs">Shift</kbd> +
      <kbd class="kbd kbd-xs"> Enter </kbd> to create and add another
    </p>
  </BaseModal>
</template>

<script setup lang="ts">
import type {
  ItemCreate,
  ItemOut,
  ItemUpdate,
  LabelOut,
  LocationOut,
} from "~~/lib/api/types/data-contracts";
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

type CreateMode = "new" | "new_continue" | "merge_existing";

type ExistingItemDecision = {
  item: ItemOut;
  reason: string;
  confidence: number;
  exact: boolean;
  previewUrl: string | null;
  photoCount: number;
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
const existingMatch = ref<ExistingItemDecision | null>(null);
const form = reactive({
  location: null as LocationOut | null,
  name: "",
  description: "",
  labels: [] as LabelOut[],
  quantity: 1,
  insured: false,
  serialNumber: "",
  modelNumber: "",
  manufacturer: "",
  notes: "",
  purchaseFrom: "",
  purchasePrice: "",
  purchaseTime: "",
  lifetimeWarranty: false,
  warrantyExpires: "",
  warrantyDetails: "",
  soldTo: "",
  soldPrice: "",
  soldTime: "",
  soldNotes: "",
});

const { shift } = useMagicKeys();
const primaryActionLabel = computed(() =>
  existingMatch.value?.exact ? "Save as New" : "Create",
);

whenever(
  () => modal.value,
  () => {
    focused.value = true;
    ensureValidLocationSelection(locationId.value);

    if (labelId.value) {
      form.labels = labels.value.filter((l) => l.id === labelId.value);
    }

    if (!aiSettings.hasApiKey.value) {
      aiSettings.promptForApiKey(
        "Add your OpenAI API key to enable AI item prefill from photos.",
      );
    }
  },
);

watch(
  () => modal.value,
  (isOpen) => {
    if (!isOpen) {
      resetFormState();
    }
  },
);

watch(
  () => locations.value,
  () => {
    ensureValidLocationSelection(locationId.value);
  },
  { immediate: true },
);

function ensureValidLocationSelection(preferredId?: string | null) {
  const availableLocations = locations.value ?? [];
  if (!availableLocations.length) {
    form.location = null;
    return null;
  }

  const requestedLocationId = preferredId || form.location?.id || null;
  const selectedLocation = requestedLocationId
    ? availableLocations.find(
        (location) => location.id === requestedLocationId,
      ) || null
    : null;

  form.location = selectedLocation || availableLocations[0];
  return form.location;
}

function getSelectedLabelIds() {
  const validIds = new Set((labels.value ?? []).map((label) => label.id));
  return form.labels
    .map((label) => label.id)
    .filter((id): id is string => Boolean(id) && validIds.has(id));
}

function openFilePicker() {
  photoInput.value?.click();
}

function onPhotoChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);

  const next = files.map((file) => ({
    id: crypto.randomUUID(),
    file,
    preview: URL.createObjectURL(file),
  }));

  photos.value = [...photos.value, ...next];
  clearExistingMatch();
  aiSummary.value = "";
  target.value = "";
}

function removePhoto(photoId: string) {
  const found = photos.value.find((x) => x.id === photoId);
  if (found) {
    URL.revokeObjectURL(found.preview);
  }

  photos.value = photos.value.filter((x) => x.id !== photoId);
  clearExistingMatch();
  aiSummary.value = "";
}

async function analyzeWithAI() {
  if (!photos.value.length) {
    aiSummary.value = "Add at least one photo before running AI prefill.";
    toast.error("Add at least one photo first");
    return;
  }

  if (!aiSettings.hasApiKey.value) {
    const ok = aiSettings.promptForApiKey(
      "Enter your OpenAI API key to analyze these photos.",
    );
    if (!ok) {
      aiSummary.value =
        "AI prefill canceled because no OpenAI API key was provided.";
      toast.error("OpenAI API key required for AI prefill");
      return;
    }
  }

  aiLoading.value = true;
  aiSummary.value = "Analyzing photos...";
  toast.info("AI prefill started");

  try {
    const result = await aiAgent.analyzeFromImages({
      apiKey: aiSettings.apiKey.value,
      files: photos.value.map((x) => x.file),
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
          items: data.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
          })),
          hasMore: data.page * data.pageSize < data.total,
        };
      },
      getItemDetails: async (id) => {
        if (!id) {
          return null;
        }

        const { data, error } = await api.items.get(id);
        if (error || !data) {
          return null;
        }

        return {
          id: data.id,
          name: data.name,
          description: data.description,
          quantity: data.quantity,
          manufacturer: data.manufacturer,
          modelNumber: data.modelNumber,
          serialNumber: data.serialNumber,
          purchaseFrom: data.purchaseFrom,
          purchasePrice: data.purchasePrice,
          notes: data.notes,
          attachments: data.attachments.map((attachment) => ({
            id: attachment.id,
            title: attachment.document?.title || "",
            type: attachment.type,
            primary: attachment.primary,
          })),
          photoCount: data.attachments.filter(
            (attachment) => attachment.type === AttachmentTypes.Photo,
          ).length,
        };
      },
    });

    const existingItem = await (async () => {
      if (!result.reuseCandidate?.id) {
        return null;
      }

      const { data, error } = await api.items.get(result.reuseCandidate.id);
      return error || !data ? null : data;
    })();
    const exactMatch = existingItem
      ? buildExistingMatchDecision(
          existingItem,
          result.reuseCandidate?.reason || "",
          result.reuseCandidate?.confidence || 0,
          result.prefill,
        )
      : null;

    if (isSparsePrefill(result.prefill) && existingItem && !exactMatch?.exact) {
      if (existingItem) {
        applyExistingItemPrefill(existingItem);
      }
    }

    applyAIPrefill(result.prefill);
    existingMatch.value = exactMatch;

    if (exactMatch?.exact) {
      aiSummary.value = `Found an exact match for "${exactMatch.item.name}". Choose whether to add quantity or save a new item.`;
    } else if (result.shouldReuseExisting && result.reuseCandidate) {
      aiSummary.value = `Looks like "${result.reuseCandidate.name}" may already exist. ${result.reuseCandidate.reason}`;
    } else if (result.extractedDetails.length > 0) {
      aiSummary.value = `AI extracted: ${result.extractedDetails.slice(0, 3).join(" • ")}`;
    } else {
      aiSummary.value = "AI prefill complete.";
    }

    toast.success("AI prefill applied");
  } catch (error) {
    console.error(error);
    aiSummary.value =
      error instanceof Error ? error.message : "AI prefill failed.";
    toast.error("AI prefill failed");
  } finally {
    aiLoading.value = false;
  }
}

function applyAIPrefill(
  prefill: Awaited<ReturnType<typeof aiAgent.analyzeFromImages>>["prefill"],
) {
  form.name = prefill.name || form.name;
  form.description = prefill.description || form.description;
  form.quantity = prefill.quantity || form.quantity;
  form.insured = prefill.insured;
  form.serialNumber = prefill.serialNumber || form.serialNumber;
  form.modelNumber = prefill.modelNumber || form.modelNumber;
  form.manufacturer = prefill.manufacturer || form.manufacturer;
  form.notes = prefill.notes || form.notes;
  form.purchaseFrom = prefill.purchaseFrom || form.purchaseFrom;
  form.purchasePrice = prefill.purchasePrice || form.purchasePrice;
  form.purchaseTime = prefill.purchaseTime || form.purchaseTime;
  form.lifetimeWarranty = prefill.lifetimeWarranty;
  form.warrantyExpires = prefill.warrantyExpires || form.warrantyExpires;
  form.warrantyDetails = prefill.warrantyDetails || form.warrantyDetails;
  form.soldTo = prefill.soldTo || form.soldTo;
  form.soldPrice = prefill.soldPrice || form.soldPrice;
  form.soldTime = prefill.soldTime || form.soldTime;
  form.soldNotes = prefill.soldNotes || form.soldNotes;
}

function applyExistingItemPrefill(item: ItemOut) {
  form.name = item.name || form.name;
  form.description = item.description || form.description;
  form.quantity = item.quantity || form.quantity;
  form.insured = item.insured;
  form.serialNumber = item.serialNumber || form.serialNumber;
  form.modelNumber = item.modelNumber || form.modelNumber;
  form.manufacturer = item.manufacturer || form.manufacturer;
  form.notes = item.notes || form.notes;
  form.purchaseFrom = item.purchaseFrom || form.purchaseFrom;
  form.purchasePrice = item.purchasePrice || form.purchasePrice;
  form.purchaseTime = item.purchaseTime
    ? String(item.purchaseTime)
    : form.purchaseTime;
  form.lifetimeWarranty = item.lifetimeWarranty;
  form.warrantyExpires = item.warrantyExpires
    ? String(item.warrantyExpires)
    : form.warrantyExpires;
  form.warrantyDetails = item.warrantyDetails || form.warrantyDetails;
  form.soldTo = item.soldTo || form.soldTo;
  form.soldPrice = item.soldPrice || form.soldPrice;
  form.soldTime = item.soldTime ? String(item.soldTime) : form.soldTime;
  form.soldNotes = item.soldNotes || form.soldNotes;
}

function isSparsePrefill(
  prefill: Awaited<ReturnType<typeof aiAgent.analyzeFromImages>>["prefill"],
) {
  const filledFields = [
    prefill.name,
    prefill.description,
    prefill.manufacturer,
    prefill.modelNumber,
    prefill.serialNumber,
    prefill.notes,
    prefill.purchaseFrom,
    prefill.purchasePrice,
    prefill.purchaseTime,
    prefill.warrantyExpires,
    prefill.warrantyDetails,
    prefill.soldTo,
    prefill.soldPrice,
    prefill.soldTime,
    prefill.soldNotes,
  ].filter((value) => String(value || "").trim().length > 0).length;

  return filledFields < 3;
}

function buildExistingMatchDecision(
  item: ItemOut,
  reason: string,
  confidence: number,
  prefill: Awaited<ReturnType<typeof aiAgent.analyzeFromImages>>["prefill"],
): ExistingItemDecision {
  const photo = item.attachments.find(
    (attachment) => attachment.type === AttachmentTypes.Photo,
  );
  const photoCount = item.attachments.filter(
    (attachment) => attachment.type === AttachmentTypes.Photo,
  ).length;

  return {
    item,
    reason: reason || "A saved item looks similar to these photos.",
    confidence,
    exact: isExactMatch(prefill, item, confidence),
    previewUrl: photo
      ? api.authURL(`/items/${item.id}/attachments/${photo.id}`)
      : null,
    photoCount,
  };
}

function normalizeMatchValue(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePriceValue(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "") {
    return "0";
  }

  const normalized = raw
    .replace(/[^0-9,.-]/g, "")
    .replace(/(?!^)-/g, "");

  const commaIndex = normalized.lastIndexOf(",");
  const dotIndex = normalized.lastIndexOf(".");

  if (commaIndex !== -1 && dotIndex !== -1) {
    if (commaIndex > dotIndex) {
      return normalized.replace(/\./g, "").replace(",", ".");
    }

    return normalized.replace(/,/g, "");
  }

  if (commaIndex !== -1) {
    return normalized.replace(",", ".");
  }

  return normalized;
}

function normalizeDateValue(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }

    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function isExactMatch(
  prefill: Awaited<ReturnType<typeof aiAgent.analyzeFromImages>>["prefill"],
  item: ItemOut,
  confidence: number,
) {
  const prefillSerial = normalizeMatchValue(prefill.serialNumber);
  const itemSerial = normalizeMatchValue(item.serialNumber);
  if (prefillSerial && itemSerial && prefillSerial === itemSerial) {
    return true;
  }

  const prefillManufacturer = normalizeMatchValue(prefill.manufacturer);
  const itemManufacturer = normalizeMatchValue(item.manufacturer);
  const prefillModel = normalizeMatchValue(prefill.modelNumber);
  const itemModel = normalizeMatchValue(item.modelNumber);
  if (prefillManufacturer && itemManufacturer && prefillModel && itemModel) {
    return (
      prefillManufacturer === itemManufacturer && prefillModel === itemModel
    );
  }

  const prefillName = normalizeMatchValue(prefill.name);
  const itemName = normalizeMatchValue(item.name);
  return Boolean(
    prefillName && itemName && prefillName === itemName && confidence >= 0.92,
  );
}

function clearExistingMatch() {
  existingMatch.value = null;
}

function buildItemUpdatePayload(
  item: ItemOut,
  selectedLocationId: string,
): ItemUpdate {
  return {
    id: item.id,
    name: form.name,
    description: form.description,
    archived: item.archived,
    assetId: item.assetId,
    fields: item.fields || [],
    insured: form.insured,
    labelIds: getSelectedLabelIds(),
    lifetimeWarranty: form.lifetimeWarranty,
    locationId: selectedLocationId,
    manufacturer: form.manufacturer,
    modelNumber: form.modelNumber,
    notes: form.notes,
    parentId: null,
    purchaseFrom: form.purchaseFrom,
    purchasePrice: normalizePriceValue(form.purchasePrice),
    purchaseTime: normalizeDateValue(form.purchaseTime),
    quantity: Math.max(1, Number(form.quantity) || 1),
    serialNumber: form.serialNumber,
    soldNotes: form.soldNotes,
    soldPrice: normalizePriceValue(form.soldPrice),
    soldTime: normalizeDateValue(form.soldTime),
    soldTo: form.soldTo,
    warrantyDetails: form.warrantyDetails,
    warrantyExpires: normalizeDateValue(form.warrantyExpires),
  };
}

async function uploadPendingPhotos(itemId: string) {
  let failed = 0;

  for (const photo of photos.value) {
    const { error } = await api.items.attachments.add(
      itemId,
      photo.file,
      photo.file.name,
      AttachmentTypes.Photo,
    );
    if (error) {
      failed++;
    }
  }

  return failed;
}

function resetFormState() {
  for (const photo of photos.value) {
    URL.revokeObjectURL(photo.preview);
  }

  form.name = "";
  form.description = "";
  form.location = ensureValidLocationSelection(locationId.value);
  form.labels = labelId.value
    ? labels.value.filter((l) => l.id === labelId.value)
    : [];
  form.quantity = 1;
  form.insured = false;
  form.serialNumber = "";
  form.modelNumber = "";
  form.manufacturer = "";
  form.notes = "";
  form.purchaseFrom = "";
  form.purchasePrice = "";
  form.purchaseTime = "";
  form.lifetimeWarranty = false;
  form.warrantyExpires = "";
  form.warrantyDetails = "";
  form.soldTo = "";
  form.soldPrice = "";
  form.soldTime = "";
  form.soldNotes = "";
  photos.value = [];
  aiSummary.value = "";
  clearExistingMatch();
  focused.value = false;
}

async function create(mode: CreateMode = "new") {
  const selectedLocation = ensureValidLocationSelection(locationId.value);
  if (!selectedLocation?.id) {
    toast.error("Select a location before creating");
    return;
  }

  if (mode === "new" && shift.value) {
    mode = "new_continue";
  }

  loading.value = true;

  if (mode === "merge_existing" && existingMatch.value?.exact) {
    const existingItem = existingMatch.value.item;
    const nextQuantity =
      existingItem.quantity + Math.max(1, Number(form.quantity) || 1);

    const { error: patchError } = await api.items.patch(existingItem.id, {
      id: existingItem.id,
      quantity: nextQuantity,
    });

    if (patchError) {
      loading.value = false;
      toast.error("Failed to add quantity to the existing item");
      return;
    }

    const failedUploads = await uploadPendingPhotos(existingItem.id);
    loading.value = false;

    if (failedUploads > 0) {
      toast.error(
        `Quantity updated, but ${failedUploads} photo${failedUploads === 1 ? "" : "s"} failed to save`,
      );
    } else {
      toast.success("Quantity updated and photos saved");
    }

    resetFormState();
    modal.value = false;
    navigateTo(`/item/${existingItem.id}`);
    return;
  }

  const out: ItemCreate = {
    parentId: null,
    name: form.name,
    description: form.description,
    locationId: selectedLocation.id,
    labelIds: getSelectedLabelIds(),
  };

  const { error, data } = await api.items.create(out);
  if (error) {
    loading.value = false;
    toast.error("Couldn't create item");
    return;
  }

  const updatePayload = buildItemUpdatePayload(data, selectedLocation.id);

  const { error: updateError } = await api.items.update(data.id, updatePayload);
  if (updateError) {
    loading.value = false;
    toast.error("Item created, but failed to save all details");
    return;
  }

  const failedUploads = await uploadPendingPhotos(data.id);
  loading.value = false;

  if (failedUploads > 0) {
    toast.error(
      `Item saved, but ${failedUploads} photo${failedUploads === 1 ? "" : "s"} failed to upload`,
    );
  } else {
    toast.success("Item and photos saved");
  }

  resetFormState();

  if (mode !== "new_continue") {
    modal.value = false;
    navigateTo(`/item/${data.id}`);
  }
}
</script>
