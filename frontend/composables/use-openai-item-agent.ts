import type { ItemSummary } from "~~/lib/api/types/data-contracts";

type ExistingItemMatch = Pick<ItemSummary, "id" | "name" | "description">;

type AgentItemPrefill = {
  name: string;
  description: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  notes?: string;
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
  listExistingItems: (q: { query: string; page?: number }) => Promise<{ items: ExistingItemMatch[]; hasMore: boolean }>;
  getItemDetails: (id: string) => Promise<Record<string, unknown> | null>;
};

type OpenAIResponse = {
  id: string;
  output?: Array<Record<string, any>>;
  output_text?: string;
};

const MODEL = "gpt-4.1-mini";

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["shouldReuseExisting", "reuseCandidate", "prefill", "extractedDetails"],
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
      required: ["name", "description"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        manufacturer: { type: "string" },
        modelNumber: { type: "string" },
        serialNumber: { type: "string" },
        notes: { type: "string" },
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
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export function useOpenAIItemAgent() {
  async function requestResponse(apiKey: string, body: Record<string, unknown>) {
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

  async function analyzeFromImages(params: AnalyzeParams): Promise<ItemAgentResult> {
    const imageInputs = await Promise.all(params.files.map(fileToDataUrl));

    const tools = [
      {
        type: "function",
        name: "list_existing_items",
        description: "Search existing items. Use this first, then optionally paginate for more matches.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: { type: "string" },
            page: { type: "number" },
          },
        },
      },
      {
        type: "function",
        name: "get_item_details",
        description: "Get detailed existing item fields by id if candidate looks similar.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    ];

    const input = [
      {
        role: "system",
        content:
          "You are a Homebox inventory agent. First call list_existing_items. If useful, call it more times and get_item_details for best matches. Then output JSON only, following schema.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Analyze these item photos and create prefill fields. Prefer reusing existing item structure if this appears to be the same model or same item.",
          },
          ...imageInputs.map(imageUrl => ({
            type: "input_image",
            image_url: imageUrl,
          })),
        ],
      },
    ];

    let resp = await requestResponse(params.apiKey, {
      model: MODEL,
      input,
      tools,
      text: {
        format: {
          type: "json_schema",
          name: "inventory_prefill",
          schema: outputSchema,
          strict: true,
        },
      },
    });

    for (let i = 0; i < 6; i++) {
      const calls = (resp.output || []).filter(x => x.type === "function_call");
      if (!calls.length) {
        break;
      }

      const outputs = await Promise.all(
        calls.map(async call => {
          const args = JSON.parse(call.arguments || "{}");

          if (call.name === "list_existing_items") {
            const result = await params.listExistingItems({
              query: String(args.query || ""),
              page: Number.isFinite(args.page) ? Number(args.page) : 1,
            });

            return {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(result),
            };
          }

          if (call.name === "get_item_details") {
            const result = await params.getItemDetails(String(args.id || ""));

            return {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({ item: result }),
            };
          }

          return {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: "Unknown tool" }),
          };
        })
      );

      resp = await requestResponse(params.apiKey, {
        model: MODEL,
        previous_response_id: resp.id,
        input: outputs,
        tools,
        text: {
          format: {
            type: "json_schema",
            name: "inventory_prefill",
            schema: outputSchema,
            strict: true,
          },
        },
      });
    }

    const payload = resp.output_text || "{}";
    const parsed = JSON.parse(payload) as ItemAgentResult;

    return {
      shouldReuseExisting: Boolean(parsed.shouldReuseExisting),
      reuseCandidate: parsed.reuseCandidate || null,
      prefill: {
        name: parsed.prefill?.name || "",
        description: parsed.prefill?.description || "",
        manufacturer: parsed.prefill?.manufacturer || "",
        modelNumber: parsed.prefill?.modelNumber || "",
        serialNumber: parsed.prefill?.serialNumber || "",
        notes: parsed.prefill?.notes || "",
      },
      extractedDetails: parsed.extractedDetails || [],
    };
  }

  return {
    analyzeFromImages,
  };
}
