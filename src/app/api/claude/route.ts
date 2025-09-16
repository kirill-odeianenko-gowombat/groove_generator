import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: Request): Promise<Response> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing ANTHROPIC_API_KEY on server" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const body = (await req.json().catch(() => ({}))) as Partial<{
      model: string;
      max_tokens: number;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      prompt: string;
    }>;

    const model: string = body.model ?? "claude-3-5-sonnet-latest";
    const maxTokens: number = Math.min(Number(body.max_tokens ?? 512), 4096);

    // Support either a simple prompt or a full messages array
    const hasMessages = Array.isArray(body.messages);
    const messages: Array<{ role: "user" | "assistant"; content: string }> = hasMessages
      ? (body.messages as Array<{ role: "user" | "assistant"; content: string }>)
      : [{ role: "user", content: String(body.prompt ?? "") }];

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      messages,
    });

    // Extract text from returned content blocks
    const text = (response.content ?? [])
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return new Response(
      JSON.stringify({ text, raw: response }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

export const dynamic = "force-dynamic";

