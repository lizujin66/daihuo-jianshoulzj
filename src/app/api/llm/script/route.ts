import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { generateScript, analyzeProduct } from "@/lib/script-engine/generator";
import type { ScriptStyleType } from "@/lib/script-engine/prompts";
import type { ProductCategory } from "@/lib/script-engine/templates";

/** 将本地图片路径转为 base64 data URI，供 LLM 视觉模型使用 */
async function imagePathToBase64(imagePath: string): Promise<string> {
  // 已经是完整 URL 或 base64，直接返回
  if (imagePath.startsWith("http") || imagePath.startsWith("data:")) {
    return imagePath;
  }

  // 本地 API 路径如 /api/files/projectId/filename.png
  // 提取实际文件路径: data/uploads/projectId/filename.png
  const match = imagePath.match(/\/api\/files\/(.+)/);
  if (!match) return imagePath;

  const relativePath = match[1];
  const filePath = join(process.cwd(), "data", "uploads", relativePath);

  try {
    const buffer = await readFile(filePath);
    const base64 = buffer.toString("base64");
    // 根据扩展名推断 MIME 类型
    const ext = filePath.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    };
    const mime = mimeMap[ext] || "image/png";
    return `data:${mime};base64,${base64}`;
  } catch {
    console.warn(`无法读取图片文件: ${filePath}`);
    return imagePath;
  }
}

import { getDb } from "@/lib/db";
import { projects, scripts as dbScripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// 生成带货脚本
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    projectId,
    productImages,
    productName,
    productCategory,
    productDescription,
    styleType,
    duration,
    llmConfig,
  } = body;

  if (!productName) {
    return NextResponse.json({ error: "请填写商品名称" }, { status: 400 });
  }

  if (!llmConfig?.baseUrl || !llmConfig?.apiKey || !llmConfig?.model) {
    return NextResponse.json({ error: "请配置 LLM 参数（baseUrl、apiKey、model）" }, { status: 400 });
  }

  try {
    // 商品图分析：将本地路径转为 base64 后传给视觉模型
    let analysis = body.productAnalysis;
    if (!analysis && productImages?.length > 0 && llmConfig) {
      try {
        const imageUrls = await Promise.all(
          (productImages as string[]).map(imagePathToBase64)
        );
        analysis = await analyzeProduct(imageUrls, llmConfig);
      } catch (e) {
        // 图片分析失败不阻塞脚本生成
        console.warn("商品图片分析失败（已跳过）:", e);
      }
    }

    // 生成脚本
    const scripts = await generateScript({
      productName,
      category: (productCategory || "beauty") as ProductCategory,
      productDescription,
      productAnalysis: analysis,
      styleType: (styleType || "pain_point") as ScriptStyleType,
      targetDuration: duration || 30,
      llmConfig,
    });

    // 将生成结果持久化存储到 SQLite 数据库中
    try {
      const db = getDb();
      if (projectId) {
        // 1. 如果有商品视觉分析报告，持久化更新到 projects 表
        if (analysis) {
          await db
            .update(projects)
            .set({ productAnalysis: analysis, status: "scripting" })
            .where(eq(projects.id, projectId));
        } else {
          await db
            .update(projects)
            .set({ status: "scripting" })
            .where(eq(projects.id, projectId));
        }

        // 2. 清理可能已有的历史脚本（防止重复生成），然后写入新生成的 3 个脚本方案
        await db.delete(dbScripts).where(eq(dbScripts.projectId, projectId));

        for (const script of scripts) {
          await db.insert(dbScripts).values({
            projectId: projectId,
            title: script.title,
            styleType: script.styleType as "pain_point" | "scene" | "comparison" | "story" | "custom",
            totalDuration: script.totalDuration,
            shots: script.shots,
            selected: false,
          });
        }
        console.log(`[POST /api/llm/script] 成功保存 ${scripts.length} 个生成的脚本到数据库（项目 ID: ${projectId}）`);
      }
    } catch (dbError) {
      console.error("[POST /api/llm/script] 将脚本写入数据库时出错:", dbError);
    }

    return NextResponse.json({ scripts, analysis });
  } catch (error) {
    console.error("脚本生成失败:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `脚本生成失败: ${errMsg}` },
      { status: 500 }
    );
  }
}
