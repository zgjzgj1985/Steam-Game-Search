const LLM_PROVIDER = (process.env.LLM_PROVIDER || "qianwen") as Provider;
const LLM_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.LLM_API_KEY || "";

// 启动时验证 API Key，避免运行时才报模糊错误
if (!LLM_API_KEY) {
  console.warn(
    "[llm] 警告: 未配置 LLM API Key（DASHSCOPE_API_KEY 或 LLM_API_KEY）。" +
    "分析生成功能将不可用。请参考 .env.example 配置。"
  );
}

function getBaseUrl(): string {
  switch (LLM_PROVIDER) {
    case "qianwen":
      return process.env.LLM_BASE_URL_QIANWEN || "https://dashscope.aliyuncs.com/compatible-mode/v1";
    case "openai":
      return process.env.LLM_BASE_URL_OPENAI || "https://api.openai.com/v1";
    case "ollama":
      return process.env.LLM_BASE_URL_OLLAMA || "http://localhost:11434/v1";
    default:
      return process.env.LLM_BASE_URL_QIANWEN || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  }
}

function getModel(): string {
  switch (LLM_PROVIDER) {
    case "qianwen":
      return process.env.LLM_MODEL_QIANWEN || "qwen3.6-plus";
    case "openai":
      return process.env.LLM_MODEL_OPENAI || "gpt-4o-mini";
    case "ollama":
      return process.env.LLM_MODEL_OLLAMA || "llama3";
    default:
      return "qwen3.6-plus";
  }
}

type Provider = "openai" | "qianwen" | "ollama";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  reasoning?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${LLM_API_KEY}`,
  };
}

function buildBody(messages: LLMMessage[]): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: getModel(),
    messages,
    max_tokens: parseInt(process.env.LLM_MAX_TOKENS || "8192", 10),
    temperature: 0.7,
  };

  if (LLM_PROVIDER === "qianwen") {
    base.extra_body = {
      enable_thinking: false,
    };
  }

  return base;
}

export async function chat(messages: LLMMessage[]): Promise<LLMResponse> {
  if (!LLM_API_KEY || LLM_API_KEY === "your-api-key-here") {
    throw new Error(
      `LLM API 未配置。请确保 .env 中设置了 DASHSCOPE_API_KEY（当前 Provider: ${LLM_PROVIDER}）`
    );
  }

  const url = `${getBaseUrl()}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(buildBody(messages)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API 请求失败 [${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error("LLM API 返回内容为空");
  }

  const msg = choice.message;

  return {
    content: msg.content || "",
    reasoning: msg.reasoning_content || undefined,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

export async function chatJSON<T>(messages: LLMMessage[]): Promise<T> {
  const systemMsg: LLMMessage = {
    role: "system",
    content:
      "你是资深回合制/卡牌战斗设计方向的分析师。输出必须是合法 JSON；其中 narrative 字段是用户阅读主体，须写满、写具体、可检验，禁止用泛化形容词堆砌。不要在 JSON 外输出任何文字。",
  };

  const result = await chat([systemMsg, ...messages]);
  const cleaned = result.content
    .replace(/```json\n?/g, "")
    .replace(/```\n?$/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`LLM 返回的不是有效 JSON:\n${cleaned.slice(0, 500)}`);
  }
}
