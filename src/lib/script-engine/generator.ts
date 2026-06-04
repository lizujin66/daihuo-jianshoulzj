/**
 * 脚本生成器
 * 使用 OpenAI 兼容格式调用 LLM 生成带货短视频脚本
 * 支持自定义 LLM endpoint、流式输出、商品图片分析
 */

import OpenAI from "openai";
import {
  SYSTEM_PROMPT,
  PRODUCT_ANALYSIS_PROMPT,
  buildUserPrompt,
  buildBatchPrompt,
  type ScriptGenerationInput,
  type ScriptStyleType,
} from "./prompts";
import type { Shot } from "@/lib/db/schema";

// ==================== 类型定义 ====================

/** LLM 配置 */
export interface LLMConfig {
  /** API 地址（兼容 OpenAI 格式的任意 endpoint） */
  baseUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 文本模型名称 */
  model: string;
  /** 视觉模型名称（用于商品图片分析，不指定则使用 model） */
  visionModel?: string;
}

/** 脚本生成输入参数 */
export interface ScriptInput extends ScriptGenerationInput {
  /** LLM 配置 */
  llmConfig: LLMConfig;
}

/** 生成的脚本结果 */
export interface GeneratedScript {
  /** 脚本标题 */
  title: string;
  /** 脚本风格 */
  styleType: string;
  /** 总时长（秒） */
  totalDuration: number;
  /** 分镜列表 */
  shots: Shot[];
}

/** 流式输出回调 */
export interface StreamCallbacks {
  /** 收到文本片段时触发 */
  onToken?: (token: string) => void;
  /** 生成完成时触发 */
  onComplete?: (scripts: GeneratedScript[]) => void;
  /** 发生错误时触发 */
  onError?: (error: Error) => void;
}

/** 商品分析结果 */
export interface ProductAnalysisResult {
  /** 商品名称 */
  productName: string;
  /** 品类 */
  category: string;
  /** 品牌 */
  brand: string;
  /** 视觉特征 */
  visualFeatures: {
    mainColor: string;
    designStyle: string;
    productForm: string;
    texture: string;
  };
  /** 卖点列表 */
  sellingPoints: string[];
  /** 目标用户 */
  targetAudience: string;
  /** 使用场景 */
  usageScenarios: string[];
  /** 痛点 */
  painPoints: string[];
  /** 视频建议 */
  videoSuggestions: {
    recommendedAngles: string[];
    keyVisuals: string[];
    suggestedStyle: string;
  };
}

// ==================== 工具函数 ====================

/** 创建 OpenAI 客户端 */
function createClient(config: LLMConfig): OpenAI {
  return new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });
}

/**
 * 从 LLM 返回的文本中提取 JSON
 * 兼容直接输出 JSON 和包裹在 markdown 代码块中的情况
 */
export function extractJSON(text: string): string {
  // 尝试移除 markdown 代码块标记
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 尝试找到第一个 { 或 [ 开头的 JSON
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return text.trim();
}

/**
 * 验证并修正单个 Shot 数据
 * 确保所有必填字段都有合法值
 */
function validateShot(shot: Partial<Shot>, index: number): Shot {
  const validTypes: Shot["type"][] = ["hook", "pain_point", "product_reveal", "demo", "social_proof", "cta"];
  const validTransitions: Shot["transition"][] = ["ai_start_end", "ai_reference", "direct_concat", "ffmpeg_fade"];
  const validSources: Shot["visualSource"][] = ["ai_generate", "product_image", "user_upload"];

  return {
    shotId: shot.shotId || index + 1,
    type: validTypes.includes(shot.type as Shot["type"]) ? (shot.type as Shot["type"]) : "demo",
    duration: typeof shot.duration === "number" && shot.duration > 0 ? shot.duration : 3,
    description: shot.description || "",
    camera: shot.camera || "固定镜头",
    visualSource: validSources.includes(shot.visualSource as Shot["visualSource"]) ? (shot.visualSource as Shot["visualSource"]) : "ai_generate",
    transition: validTransitions.includes(shot.transition as Shot["transition"]) ? (shot.transition as Shot["transition"]) : "direct_concat",
    voiceover: shot.voiceover || "",
    prompt: shot.prompt || undefined,
  };
}

/**
 * 验证并修正完整的脚本数据
 */
function validateScript(raw: Record<string, unknown>, fallbackStyleType: string): GeneratedScript {
  const shots = Array.isArray(raw.shots)
    ? (raw.shots as Partial<Shot>[]).map((s, i) => validateShot(s, i))
    : [];

  const totalDuration = typeof raw.totalDuration === "number"
    ? raw.totalDuration
    : shots.reduce((sum, s) => sum + s.duration, 0);

  return {
    title: (raw.title as string) || "未命名脚本",
    styleType: (raw.styleType as string) || fallbackStyleType,
    totalDuration,
    shots,
  };
}

// ==================== 核心功能 ====================

/**
 * 生成带货脚本（单次调用，返回完整结果）
 * @param input - 脚本生成输入参数
 * @returns 生成的脚本数组
 */
export async function generateScript(input: ScriptInput): Promise<GeneratedScript[]> {
  const requestedStyle = input.styleType as string;

  // 风格与切入角度配置
  const styleConfigs: { style: ScriptStyleType; requirement: string }[] = [];

  if (requestedStyle === "auto" || !requestedStyle) {
    // 智能推荐模式：生成三种不同风格的脚本（痛点、场景、对比）
    styleConfigs.push({
      style: "pain_point",
      requirement: "【切入角度】聚焦用户日常生活中的核心痛点，作为“救星”登场，用强烈的对比激发欲望。"
    });
    styleConfigs.push({
      style: "scene",
      requirement: "【切入角度】聚焦轻松真实的生活场景，以第一人称Vlog种草的形式切入，强调产品自然融入生活的舒适体验。"
    });
    styleConfigs.push({
      style: "comparison",
      requirement: "【切入角度】聚焦横向对比与评测，强调本产品的高性价比与极致性能，突出同价位无可匹敌的绝对优势。"
    });
  } else {
    // 特定风格模式：生成该风格下三个不同切入角度的脚本
    // 先做风格归一化，将前端的连字符格式映射为标准的后端下划线格式
    const normalizedStyle: ScriptStyleType =
      requestedStyle === "pain-point" ? "pain_point" :
      requestedStyle === "scenario" ? "scene" :
      (requestedStyle as ScriptStyleType);

    styleConfigs.push({
      style: normalizedStyle,
      requirement: "【切入角度一】聚焦极致性价比与日常实用性，突出“超值省心”和“闭眼入”。"
    });
    styleConfigs.push({
      style: normalizedStyle,
      requirement: "【切入角度二】聚焦黑科技、核心工艺细节或品质标准，突出产品的“专业感”和“高端质感”。"
    });
    styleConfigs.push({
      style: normalizedStyle,
      requirement: "【切入角度三】聚焦特定受众人群（如上班族、学生党或家庭）的细分痛点场景，突出“专属定制”。"
    });
  }

  // 顺序调用 LLM 生成 3 个不同的脚本，避免并发请求过多导致 429 频控报错
  const results: GeneratedScript[] = [];

  for (let i = 0; i < styleConfigs.length; i++) {
    const cfg = styleConfigs[i];
    const singleInput: ScriptInput = {
      ...input,
      styleType: cfg.style,
      customRequirements: input.customRequirements
        ? `${input.customRequirements}\n\n注意：本次生成请遵循以下特定切入点：\n${cfg.requirement}`
        : `注意：本次生成请遵循以下特定切入点：\n${cfg.requirement}`
    };

    let retries = 3;
    let delayMs = 1500; // 首次重试等待 1.5 秒
    let script: GeneratedScript | null = null;

    while (retries > 0) {
      try {
        script = await generateSingleScript(singleInput);
        script.styleType = cfg.style;
        break; // 成功获取，退出重试循环
      } catch (err: any) {
        retries--;
        const errStr = String(err);
        const isRateLimit =
          err?.status === 429 ||
          errStr.includes("429") ||
          errStr.includes("速率限制") ||
          errStr.includes("rate limit") ||
          errStr.includes("频控");

        if (isRateLimit && retries > 0) {
          console.warn(`[generateScript] 触发 API 频控限制 (429)，等待 ${delayMs}ms 后进行重试... (剩余重试次数: ${retries})`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2; // 指数级退避
        } else {
          console.error(`生成第 ${i + 1} 个脚本（风格: ${cfg.style}）失败:`, err);
          break; // 非 429 错误或重试次数用尽，跳出重试
        }
      }
    }

    if (script) {
      results.push(script);
    }

    // 每次生成之间，强制增加 800ms 的冷却缓冲，防止下一条请求立刻触发并发限制
    if (i < styleConfigs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  if (results.length === 0) {
    throw new Error("生成脚本失败：所有生成任务均已失败，请检查您的 LLM 配置或网络连接。");
  }

  return results;
}

/**
 * 生成单个脚本（更快的响应）
 * @param input - 脚本生成输入参数
 * @returns 单个生成的脚本
 */
export async function generateSingleScript(input: ScriptInput): Promise<GeneratedScript> {
  const client = createClient(input.llmConfig);
  const userPrompt = buildUserPrompt(input);

  const response = await client.chat.completions.create({
    model: input.llmConfig.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("LLM 未返回有效内容");
  }

  const jsonStr = extractJSON(content);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`LLM 返回的内容不是合法 JSON: ${jsonStr.substring(0, 200)}`);
  }
  return validateScript(parsed, input.styleType);
}

/**
 * 流式生成脚本
 * 支持实时获取生成进度，适合前端流式展示
 * @param input - 脚本生成输入参数
 * @param callbacks - 流式回调函数
 * @returns AbortController 用于取消生成
 */
export function generateScriptStream(
  input: ScriptInput,
  callbacks: StreamCallbacks,
): AbortController {
  const abortController = new AbortController();

  const run = async () => {
    const client = createClient(input.llmConfig);
    const userPrompt = buildUserPrompt(input);

    let fullContent = "";

    try {
      const stream = await client.chat.completions.create({
        model: input.llmConfig.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        stream: true,
      }, {
        signal: abortController.signal,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          callbacks.onToken?.(delta);
        }
      }

      // 流式结束后解析完整结果
      const scripts = parseScriptResponse(fullContent, input.styleType);
      callbacks.onComplete?.(scripts);
    } catch (error) {
      // 用户主动取消不算错误
      if (abortController.signal.aborted) return;
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  run();
  return abortController;
}

/**
 * 创建流式生成的 ReadableStream
 * 用于 Next.js API Route 的流式响应
 * @param input - 脚本生成输入参数
 * @returns ReadableStream
 */
export function createScriptStream(input: ScriptInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const client = createClient(input.llmConfig);
      const userPrompt = buildUserPrompt(input);

      try {
        const stream = await client.chat.completions.create({
          model: input.llmConfig.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encoder.encode(delta));
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// ==================== 商品图片分析 ====================

/**
 * 分析商品图片
 * 调用视觉模型提取商品信息、卖点、目标用户等
 * @param imageUrls - 商品图片 URL 列表（支持 http/https 和 base64 data URI）
 * @param config - LLM 配置
 * @returns 商品分析结果的 JSON 字符串
 */
export async function analyzeProduct(
  imageUrls: string[],
  config: LLMConfig,
): Promise<string> {
  const model = config.visionModel || config.model;

  // 检测是否为不支持视觉的已知文本模型
  const modelLower = model.toLowerCase();
  const isKnownTextOnly =
    modelLower.includes("deepseek") ||
    modelLower.includes("gpt-3.5") ||
    modelLower.includes("r1") ||
    modelLower.includes("v3") ||
    (modelLower.includes("llama") && !modelLower.includes("vision")) ||
    modelLower.includes("qwen-turbo") ||
    modelLower.includes("qwen-plus") ||
    modelLower.includes("qwen-max");

  // 如果是没有配置 visionModel 的纯文本模型，直接跳过视觉分析，避免报错
  if (isKnownTextOnly && !config.visionModel) {
    console.warn(`[analyzeProduct] 检测到当前使用的模型是纯文本模型 (${model})，无法直接分析图片。已自动跳过视觉分析，直接进行脚本生成。如需开启图片分析，请在设置中配置支持视觉的模型（如 gpt-4o, qwen-vl 等）作为 visionModel。`);
    return "";
  }

  const client = createClient(config);

  // 构建带图片的消息内容
  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = imageUrls.map(
    (url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    }),
  );

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PRODUCT_ANALYSIS_PROMPT },
          ...imageContent,
        ],
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * 分析商品图片并返回结构化数据
 * @param imageUrls - 商品图片 URL 列表
 * @param config - LLM 配置
 * @returns 结构化的商品分析结果
 */
export async function analyzeProductStructured(
  imageUrls: string[],
  config: LLMConfig,
): Promise<ProductAnalysisResult> {
  const rawResult = await analyzeProduct(imageUrls, config);
  const jsonStr = extractJSON(rawResult);
  try {
    return JSON.parse(jsonStr) as ProductAnalysisResult;
  } catch {
    throw new Error(`商品分析结果不是合法 JSON: ${jsonStr.substring(0, 200)}`);
  }
}

// ==================== 解析工具 ====================

/**
 * 解析 LLM 返回的脚本内容
 * 兼容多种返回格式（单个对象、数组、嵌套对象等）
 */
export function parseScriptResponse(content: string, fallbackStyleType: string): GeneratedScript[] {
  const jsonStr = extractJSON(content);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`LLM 返回的内容不是合法 JSON: ${jsonStr.substring(0, 200)}`);
  }

  // 处理不同的返回格式
  let rawScripts: Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    // 直接返回数组
    rawScripts = parsed;
  } else if (parsed.scripts && Array.isArray(parsed.scripts)) {
    // { scripts: [...] } 格式
    rawScripts = parsed.scripts;
  } else if (parsed.shots && Array.isArray(parsed.shots)) {
    // 单个脚本对象
    rawScripts = [parsed];
  } else {
    throw new Error("无法解析 LLM 返回的脚本格式");
  }

  return rawScripts.map((raw) => validateScript(raw, fallbackStyleType));
}
