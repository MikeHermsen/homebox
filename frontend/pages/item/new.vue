<script setup>
  definePageMeta({
    middleware: ["auth"],
  });

  const api = useUserApi();

  const show = reactive({
    identification: true,
    purchase: false,
    sold: false,
    extras: false,
  });

  const form = reactive({
    name: "",
    description: "",
    notes: "",

    // Item Identification
    serialNumber: "",
    modelNumber: "",
    manufacturer: "",

    // Purchase Information
    purchaseTime: "",
    purchasePrice: "",
    purchaseFrom: "",

    // Sold Information
    soldTime: "",
    soldPrice: "",
    soldTo: "",
    soldNotes: "",
  });

  // AI Analysis State
  const aiState = reactive({
    analyzing: false,
    error: "",
    imagePreview: "",
    suggestedLabels: [],
    photoFile: null,
  });

  const fileInput = ref(null);

  function triggerFileInput() {
    fileInput.value?.click();
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      aiState.error = "Please select an image file.";
      return;
    }

    aiState.photoFile = file;
    aiState.error = "";

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      aiState.imagePreview = e.target?.result;
    };
    reader.readAsDataURL(file);

    await analyzeWithAI(file);
  }

  async function analyzeWithAI(file) {
    aiState.analyzing = true;
    aiState.error = "";

    try {
      const { data, error } = await api.items.aiAnalyze(file);

      if (error) {
        aiState.error = "AI analysis failed. You can still fill in the fields manually.";
        return;
      }

      // Auto-fill the form with AI suggestions
      if (data.name) form.name = data.name;
      if (data.description) form.description = data.description;
      if (data.serialNumber) form.serialNumber = data.serialNumber;
      if (data.modelNumber) form.modelNumber = data.modelNumber;
      if (data.manufacturer) form.manufacturer = data.manufacturer;
      if (data.notes) form.notes = data.notes;
      if (data.labels?.length) aiState.suggestedLabels = data.labels;

      // Auto-expand sections that have data
      if (data.serialNumber || data.modelNumber || data.manufacturer) {
        show.identification = true;
      }
      if (data.notes) {
        show.extras = true;
      }
    } catch (e) {
      aiState.error = "AI analysis failed. You can still fill in the fields manually.";
    } finally {
      aiState.analyzing = false;
    }
  }

  function clearPhoto() {
    aiState.imagePreview = "";
    aiState.photoFile = null;
    aiState.error = "";
    aiState.suggestedLabels = [];
    if (fileInput.value) {
      fileInput.value.value = "";
    }
  }

  function submit() {
    console.log("Submitted!");
  }
</script>

<template>
  <BaseContainer cmp="section">
    <BaseSectionHeader> Add an Item To Your Inventory </BaseSectionHeader>
    <form class="max-w-3xl mx-auto my-5 space-y-6" @submit.prevent="submit">
      <!-- AI Photo Analysis Section -->
      <div class="divider collapse-title px-0 cursor-pointer">📸 AI-Powered Quick Add</div>
      <div class="card bg-base-200">
        <div class="card-body">
          <p class="text-sm opacity-70 mb-3">
            Take a photo or upload an image of your item and let AI automatically fill in the details.
          </p>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden"
            @change="onFileSelected"
          />

          <!-- Image Preview & Controls -->
          <div v-if="aiState.imagePreview" class="space-y-4">
            <div class="relative rounded-xl overflow-hidden border border-base-300 max-w-sm mx-auto">
              <img :src="aiState.imagePreview" alt="Item preview" class="w-full h-auto object-contain max-h-64" />
              <button
                type="button"
                class="btn btn-circle btn-sm btn-error absolute top-2 right-2"
                @click="clearPhoto"
              >
                ✕
              </button>
            </div>

            <!-- Loading Indicator -->
            <div v-if="aiState.analyzing" class="flex flex-col items-center gap-3 py-4">
              <span class="loading loading-spinner loading-lg text-primary"></span>
              <p class="text-sm font-medium animate-pulse">AI is analyzing your item...</p>
            </div>

            <!-- Success Indicator -->
            <div v-if="!aiState.analyzing && !aiState.error && form.name" class="alert alert-success shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-sm">AI has filled in the details. Review and edit as needed.</span>
            </div>

            <!-- AI Suggested Labels -->
            <div v-if="aiState.suggestedLabels.length > 0" class="mt-2">
              <p class="text-sm font-medium mb-2">Suggested Labels:</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="label in aiState.suggestedLabels"
                  :key="label"
                  class="badge badge-primary badge-outline"
                >
                  {{ label }}
                </span>
              </div>
            </div>

            <!-- Retry Button -->
            <div v-if="!aiState.analyzing" class="flex justify-center">
              <button type="button" class="btn btn-sm btn-ghost gap-2" @click="triggerFileInput">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Different Photo
              </button>
            </div>
          </div>

          <!-- Upload Buttons (No Image Selected Yet) -->
          <div v-else class="flex flex-col items-center gap-3 py-4">
            <div
              class="border-2 border-dashed border-base-300 rounded-xl p-8 w-full text-center cursor-pointer hover:border-primary hover:bg-base-300/30 transition-all"
              @click="triggerFileInput"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p class="font-medium">Take Photo or Upload Image</p>
              <p class="text-xs opacity-50 mt-1">AI will identify the item and fill in details automatically</p>
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="aiState.error" class="alert alert-warning shadow-sm mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span class="text-sm">{{ aiState.error }}</span>
          </div>
        </div>
      </div>

      <div class="divider collapse-title px-0 cursor-pointer">Required Information</div>
      <div class="bg-base-200 card">
        <div class="card-body">
          <FormTextField v-model="form.name" label="Name" />
          <FormTextArea v-model="form.description" label="Description" limit="1000" />
        </div>
      </div>

      <div class="divider">
        <button type="button" class="btn btn-sm" @click="show.identification = !show.identification">Product Information</button>
      </div>
      <div v-if="show.identification" class="card bg-base-200">
        <div class="card-body grid md:grid-cols-2">
          <FormTextField v-model="form.serialNumber" label="Serial Number" />
          <FormTextField v-model="form.modelNumber" label="Model Number" />
          <FormTextField v-model="form.manufacturer" label="Manufacturer" />
        </div>
      </div>
      <div class="">
        <button type="button" class="btn btn-sm" @click="show.purchase = !show.purchase">Purchase Information</button>
        <div class="divider"></div>
      </div>
      <div v-if="show.purchase" class="card bg-base-200">
        <div class="card-body grid md:grid-cols-2">
          <FormTextField v-model="form.purchaseTime" label="Purchase Time" />
          <FormTextField v-model="form.purchasePrice" label="Purchase Price" />
          <FormTextField v-model="form.purchaseFrom" label="Purchase From" />
        </div>
      </div>

      <div class="divider">
        <button type="button" class="btn btn-sm" @click="show.sold = !show.sold">Sold Information</button>
      </div>
      <div v-if="show.sold" class="card bg-base-200">
        <div class="card-body">
          <div class="grid md:grid-cols-2 gap-2">
            <FormTextField v-model="form.soldTime" label="Sold Time" />
            <FormTextField v-model="form.soldPrice" label="Sold Price" />
            <FormTextField v-model="form.soldTo" label="Sold To" />
          </div>
          <FormTextArea v-model="form.soldNotes" label="Sold Notes" limit="1000" />
        </div>
      </div>
      <div class="divider">
        <button type="button" class="btn btn-sm" @click="show.extras = !show.extras">Extras</button>
      </div>
      <div v-if="show.extras" class="card bg-base-200">
        <div class="card-body">
          <FormTextArea v-model="form.notes" label="Notes" limit="1000" />
        </div>
      </div>
    </form>
  </BaseContainer>
</template>
