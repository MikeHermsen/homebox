import type { ItemSummary } from "~~/lib/api/types/data-contracts";

type ExistingItemMatch = Pick<ItemSummary, "id" | "name" | "description">;

type AgentItemPrefill = {
  name: string;
  description: string;
  quantity: number;
  insured: boolean;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  notes: string;
  purchaseFrom: string;
  purchasePrice: string;
  purchaseTime: string;
  lifetimeWarranty: boolean;
  warrantyExpires: string;
  warrantyDetails: string;
  soldTo: string;
  soldPrice: string;
  soldTime: string;
  soldNotes: string;
};

export type ItemAgentResult = {
  shouldReuseExisting: boolean;
  reuseCandidate: {
    id: string;
    name: string;
    reason: string;
    confidence: number;
  } | null;
  prefill: AgentItemPrefill;
  extractedDetails: string[];
};

type AnalyzeParams = {
  apiKey: string;
  files: File[];
  listExistingItems: (q: {
    query: string;
    page?: number;
  }) => Promise<{ items: ExistingItemMatch[]; hasMore: boolean }>;
  getItemDetails: (id: string) => Promise<Record<string, unknown> | null>;
};

type OpenAIResponse = {
  id: string;
  output: Array<Record<string, any>>;
  output_text?: string;
};

const MODEL = "gpt-4.1";

const agentTools = [
  {
    type: "function",
    name: "search_existing_items",
    description:
      "Search existing Homebox items by name, model number, manufacturer, serial number, or other identifying text from the analyzed photos.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query", "page"],
      properties: {
        query: {
          type: "string",
          description:
            "Search text built from the visible item identifiers or name.",
        },
        page: {
          type: "integer",
          minimum: 1,
          description: "Pagination page number when more results are needed.",
        },
      },
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_item_details",
    description:
      "Fetch full details for one existing Homebox item, including identifiers, quantity, description, and attachment metadata, so you can judge whether it is the exact same item.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "The existing Homebox item ID to inspect.",
        },
      },
    },
    strict: true,
  },
] as const;

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "shouldReuseExisting",
    "reuseCandidate",
    "prefill",
    "extractedDetails",
  ],
  properties: {
    shouldReuseExisting: { type: "boolean" },
    reuseCandidate: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "reason", "confidence"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            reason: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      ],
    },
    prefill: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "description",
        "quantity",
        "insured",
        "manufacturer",
        "modelNumber",
        "serialNumber",
        "notes",
        "purchaseFrom",
        "purchasePrice",
        "purchaseTime",
        "lifetimeWarranty",
        "warrantyExpires",
        "warrantyDetails",
        "soldTo",
        "soldPrice",
        "soldTime",
        "soldNotes",
      ],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        quantity: { type: "number", minimum: 1 },
        insured: { type: "boolean" },
        manufacturer: { type: "string" },
        modelNumber: { type: "string" },
        serialNumber: { type: "string" },
        notes: { type: "string" },
        purchaseFrom: { type: "string" },
        purchasePrice: { type: "string" },
        purchaseTime: { type: "string" },
        lifetimeWarranty: { type: "boolean" },
        warrantyExpires: { type: "string" },
        warrantyDetails: { type: "string" },
        soldTo: { type: "string" },
        soldPrice: { type: "string" },
        soldTime: { type: "string" },
        soldNotes: { type: "string" },
      },
    },
    extractedDetails: {
      type: "array",
      items: { type: "string" },
    },
  },
};

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function enforceRequiredForAllProperties(
  schema: Record<string, any>,
): Record<string, any> {
  const clone = structuredClone(schema);

  function visit(node: Record<string, any>) {
    if (!node || typeof node !== "object") return;

    if (
      node.type === "object" &&
      node.properties &&
      typeof node.properties === "object"
    ) {
      node.required = Object.keys(node.properties);
      Object.values(node.properties).forEach((value) =>
        visit(value as Record<string, any>),
      );
    }

    if (Array.isArray(node.anyOf)) {
      node.anyOf.forEach((value) => visit(value as Record<string, any>));
    }

    if (node.items && typeof node.items === "object") {
      visit(node.items as Record<string, any>);
    }
  }

  visit(clone);
  return clone;
}

export function useOpenAIItemAgent() {
  const strictOutputSchema = enforceRequiredForAllProperties(outputSchema);

  async function requestResponse(
    apiKey: string,
    body: Record<string, unknown>,
  ) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `OpenAI request failed (${response.status})`);
    }

    return (await response.json()) as OpenAIResponse;
  }

  async function analyzeFromImages(
    params: AnalyzeParams,
  ): Promise<ItemAgentResult> {
    const imageInputs = await Promise.all(params.files.map(fileToDataUrl));

    let input: Array<Record<string, unknown>> = [
      {
        role: "system",
        content:
          "You are a Homebox inventory agent for item creation from photos. First extract item details from the provided images. Then use available tools when needed to search for matching existing items and inspect their details before deciding whether the exact item already exists. Prioritize manufacturer, model number, serial number, SKU, and other identifying text from labels or plates. If an exact existing item is found, set shouldReuseExisting to true and explain why in reuseCandidate.reason. Output JSON only following the schema. Use empty strings for unknown text/date fields, false for unknown booleans, and 1 for unknown quantity. If a value is clearly visible, do not leave it blank.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Analyze these item photos and prefill the inventory form. Extract every field you can infer with reasonable confidence: name, description, quantity, insured, manufacturer, model number, serial number, notes, purchase details, warranty details, sold details, and booleans. If you can read a brand, model, serial, SKU, product code, price, or warranty info from a model plate, sticker, engraved tag, receipt, or packaging, include it in the matching fields. Use the Homebox tools to search for possible existing items before deciding whether this item should reuse an existing record.",
          },
          ...imageInputs.map((imageUrl) => ({
            type: "input_image",
            image_url: imageUrl,
            detail: "high",
          })),
        ],
      },
    ];

    let resp = await requestResponse(params.apiKey, {
      model: MODEL,
      tools: agentTools,
      parallel_tool_calls: false,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "inventory_prefill",
          schema: strictOutputSchema,
          strict: true,
        },
      },
    });

    for (let iteration = 0; iteration < 8; iteration++) {
      const toolCalls = (resp.output || []).filter(
        (item) => item.type === "function_call",
      );
      if (!toolCalls.length) {
        break;
      }

      input = [...input, ...resp.output];

      for (const toolCall of toolCalls) {
        const args = safeJsonParse(toolCall.arguments);
        const output = await runToolCall(params, toolCall.name, args);
        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(output),
        });
      }

      resp = await requestResponse(params.apiKey, {
        model: MODEL,
        tools: agentTools,
        parallel_tool_calls: false,
        input,
        text: {
          format: {
            type: "json_schema",
            name: "inventory_prefill",
            schema: strictOutputSchema,
            strict: true,
          },
        },
      });
    }

    const payload = extractResponseText(resp) || "{}";
    const parsed = JSON.parse(payload) as ItemAgentResult;

    return {
      shouldReuseExisting: Boolean(parsed.shouldReuseExisting),
      reuseCandidate: parsed.reuseCandidate || null,
      prefill: {
        name: parsed.prefill?.name || "",
        description: parsed.prefill?.description || "",
        quantity: Number.isFinite(parsed.prefill?.quantity)
          ? Math.max(1, Math.round(parsed.prefill.quantity))
          : 1,
        insured: Boolean(parsed.prefill?.insured),
        manufacturer: parsed.prefill?.manufacturer || "",
        modelNumber: parsed.prefill?.modelNumber || "",
        serialNumber: parsed.prefill?.serialNumber || "",
        notes: parsed.prefill?.notes || "",
        purchaseFrom: parsed.prefill?.purchaseFrom || "",
        purchasePrice: parsed.prefill?.purchasePrice || "",
        purchaseTime: parsed.prefill?.purchaseTime || "",
        lifetimeWarranty: Boolean(parsed.prefill?.lifetimeWarranty),
        warrantyExpires: parsed.prefill?.warrantyExpires || "",
        warrantyDetails: parsed.prefill?.warrantyDetails || "",
        soldTo: parsed.prefill?.soldTo || "",
        soldPrice: parsed.prefill?.soldPrice || "",
        soldTime: parsed.prefill?.soldTime || "",
        soldNotes: parsed.prefill?.soldNotes || "",
      },
      extractedDetails: parsed.extractedDetails || [],
    };
  }

  return {
    analyzeFromImages,
  };
}

async function runToolCall(
  params: AnalyzeParams,
  toolName: string,
  args: Record<string, any>,
) {
  if (toolName === "search_existing_items") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const page = Number.isInteger(args.page) && args.page > 0 ? args.page : 1;
    if (!query) {
      return { items: [], hasMore: false };
    }

    return await params.listExistingItems({ query, page });
  }

  if (toolName === "get_item_details") {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (!id) {
      return null;
    }

    return await params.getItemDetails(id);
  }

  return { error: `Unknown tool: ${toolName}` };
}

function safeJsonParse(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, any>;
  } catch {
    return {};
  }
}

function extractResponseText(resp: OpenAIResponse) {
  if (resp.output_text) {
    return resp.output_text;
  }

  for (const part of resp.output || []) {
    const content = Array.isArray(part.content) ? part.content : [];
    for (const item of content) {
      if (typeof item?.text === "string" && item.text.trim()) {
        return item.text;
      }
    }
  }

  return "";
}
