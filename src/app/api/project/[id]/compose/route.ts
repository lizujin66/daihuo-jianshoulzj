import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects, scripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { execSync, spawnSync } from "child_process";

// 获取 ffmpeg 路径（优先用 Homebrew，其次尝试系统 PATH）
function getFfmpegPath(): string {
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const result = execSync("which ffmpeg", { encoding: "utf8" }).trim();
    if (result) return result;
  } catch {}
  throw new Error("未找到 FFmpeg，请先安装：brew install ffmpeg");
}

// 将 /api/files/... 路径映射为本地文件系统路径
function apiPathToLocal(apiPath: string): string | null {
  const match = apiPath.match(/\/api\/files\/(.+)/);
  if (!match) return null;
  return path.join(process.cwd(), "data", "uploads", match[1]);
}

// 对 FFmpeg drawtext 的特殊字符进行转义
function escapeFfmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, " ");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const ffmpegPath = getFfmpegPath();

    // 从数据库加载项目和脚本
    const db = getDb();
    const projectRow = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .then((r) => r[0]);

    if (!projectRow) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const scriptList = await db
      .select()
      .from(scripts)
      .where(eq(scripts.projectId, id));

    if (scriptList.length === 0) {
      return NextResponse.json({ error: "尚未生成脚本" }, { status: 400 });
    }

    const script = scriptList[0];
    const shots: any[] = script.shots ?? [];

    if (shots.length === 0) {
      return NextResponse.json({ error: "脚本中没有分镜数据" }, { status: 400 });
    }

    // 获取商品图片的本地路径
    const rawImages: string[] = Array.isArray(projectRow.productImages)
      ? (projectRow.productImages as string[])
      : [];
    const localImages: string[] = rawImages
      .map(apiPathToLocal)
      .filter((p): p is string => p !== null && fs.existsSync(p));

    // 准备输出目录和临时目录
    const outputDir = path.join(process.cwd(), "data", "videos");
    const tmpDir = path.join(process.cwd(), "data", "tmp", id);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const outputPath = path.join(outputDir, `${id}.mp4`);
    const concatListPath = path.join(tmpDir, "concat.txt");
    const clipPaths: string[] = [];

    // 目标分辨率（竖屏 9:16）
    const W = 1080;
    const H = 1920;

    // 查找系统中文字体（macOS / Linux 均兼容）
    const fontCandidates = [
      "/System/Library/Fonts/PingFang.ttc",
      "/System/Library/Fonts/STHeiti Light.ttc",
      "/System/Library/Fonts/Supplemental/Arial Unicode MS.ttf",
      "/Library/Fonts/Arial Unicode MS.ttf",
      "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
      "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ];
    const fontFile = fontCandidates.find(fs.existsSync) ?? "";

    // 逐个分镜生成视频片段
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const duration = shot.duration ?? 3;
      const clipPath = path.join(tmpDir, `clip_${i}.mp4`);
      clipPaths.push(clipPath);

      // 选择背景：product_image 类型用商品图，其余用渐变色块
      const useProductImage =
        shot.visualSource === "product_image" && localImages.length > 0;
      const imgPath = useProductImage
        ? localImages[Math.min(i, localImages.length - 1)]
        : null;

      // 背景颜色根据镜头类型区分
      const bgColors: Record<string, string> = {
        hook: "0x1a0a2e",
        pain_point: "0x2e1a0a",
        product_reveal: "0x0a1a2e",
        demo: "0x0a2e1a",
        social_proof: "0x1a0a2e",
        cta: "0x2e0a0a",
      };
      const bgColor = bgColors[shot.type] ?? "0x111827";

      // 构建 vf 过滤链
      let vf: string;
      if (imgPath) {
        vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bgColor},setsar=1`;
      } else {
        // 纯色背景 + 镜头描述文字
        const descText = escapeFfmpegText(shot.description ?? `分镜 ${i + 1}`);
        if (fontFile) {
          vf = `scale=${W}:${H},setsar=1,drawtext=fontfile='${fontFile}':fontsize=40:fontcolor=white@0.85:text='${descText}':x=(w-tw)/2:y=(h-th)/2:line_spacing=10`;
        } else {
          vf = `scale=${W}:${H},setsar=1`;
        }
      }

      // 如果有配音文案，在底部加字幕条
      if (shot.voiceover && fontFile) {
        const voText = escapeFfmpegText(shot.voiceover.substring(0, 30));
        vf += `,drawtext=fontfile='${fontFile}':fontsize=36:fontcolor=white:text='${voText}':box=1:boxcolor=black@0.6:boxborderw=12:x=(w-tw)/2:y=h-th-80`;
      }

      let args: string[];
      if (imgPath) {
        args = [
          "-loop", "1",
          "-i", imgPath,
          "-t", String(duration),
          "-vf", vf,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-pix_fmt", "yuv420p",
          "-an",
          "-y",
          clipPath,
        ];
      } else {
        // 用 lavfi 色块作为输入
        args = [
          "-f", "lavfi",
          "-i", `color=c=${bgColor}:size=${W}x${H}:rate=30`,
          "-t", String(duration),
          "-vf", vf,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-pix_fmt", "yuv420p",
          "-an",
          "-y",
          clipPath,
        ];
      }

      const result = spawnSync(ffmpegPath, args, {
        timeout: 60000,
        encoding: "utf8",
      });

      if (result.status !== 0) {
        console.error(`[compose] clip_${i} 生成失败:`, result.stderr?.slice(-500));
        // 跳过失败的片段，继续后续
        clipPaths[i] = "";
      }
    }

    // 生成 concat 列表（只包含成功生成的片段）
    const validClips = clipPaths.filter((p) => p && fs.existsSync(p));
    if (validClips.length === 0) {
      return NextResponse.json({ error: "所有分镜生成失败，请检查 FFmpeg 安装" }, { status: 500 });
    }

    const concatContent = validClips.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent, "utf8");

    // 最终合并所有片段
    const mergeResult = spawnSync(
      ffmpegPath,
      [
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-c:v", "libx264",
        "-preset", "fast",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        "-y",
        outputPath,
      ],
      { timeout: 120000, encoding: "utf8" }
    );

    if (mergeResult.status !== 0) {
      console.error("[compose] 合并失败:", mergeResult.stderr?.slice(-500));
      return NextResponse.json(
        { error: `视频合并失败: ${mergeResult.stderr?.slice(-200)}` },
        { status: 500 }
      );
    }

    // 清理临时文件
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    const stat = fs.statSync(outputPath);
    const fileSizeMB = (stat.size / 1024 / 1024).toFixed(1);

    return NextResponse.json({
      success: true,
      videoUrl: `/api/project/${id}/video-file`,
      fileName: `${projectRow.name ?? id}.mp4`,
      fileSizeMB,
      shotCount: validClips.length,
    });
  } catch (err) {
    console.error("[compose] 出错:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
