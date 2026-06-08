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

// 检查是否支持 drawtext
let _hasDrawtext: boolean | null = null;
function checkDrawtextSupport(ffmpegPath: string): boolean {
  if (_hasDrawtext !== null) return _hasDrawtext;
  try {
    const out = execSync(`${ffmpegPath} -filters`, { encoding: "utf8" });
    _hasDrawtext = out.includes("drawtext");
  } catch {
    _hasDrawtext = false;
  }
  return _hasDrawtext;
}

// 检查是否支持 macOS say (用于文本转语音)
let _hasSay: boolean | null = null;
function checkSaySupport(): boolean {
  if (_hasSay !== null) return _hasSay;
  try {
    const out = execSync("which say", { encoding: "utf8" }).trim();
    _hasSay = out.length > 0;
  } catch {
    _hasSay = false;
  }
  return _hasSay;
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
    const hasDrawtext = checkDrawtextSupport(ffmpegPath);
    const hasSay = checkSaySupport();

    // 从数据库加载项目和脚本
    const db = getDb();
    const projectRow = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .then((r: any[]) => r[0]);

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
      let duration = shot.duration ?? 3;
      const clipPath = path.join(tmpDir, `clip_${i}.mp4`);
      clipPaths.push(clipPath);

      // --- 1. 处理音频 (TTS) ---
      let audioInput = "-f lavfi -i anullsrc=r=44100:cl=stereo";
      let isAudioFile = false;
      
      if (shot.voiceover && hasSay) {
        const audioPath = path.join(tmpDir, `audio_${i}.aiff`);
        try {
          // macOS: 使用 say 命令生成语音
          execSync(`say -v Ting-Ting "${shot.voiceover}" -o "${audioPath}"`);
          if (fs.existsSync(audioPath)) {
            audioInput = `-i "${audioPath}"`;
            isAudioFile = true;
            // 自动调整视频时长匹配语音时长（延长 0.5 秒防止太突兀）
            try {
              const durStr = execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`, { encoding: "utf8" }).trim();
              const audioDuration = parseFloat(durStr);
              if (!isNaN(audioDuration)) {
                duration = Math.max(duration, audioDuration + 0.5);
              }
            } catch (e) {
              console.warn("读取音频长度失败", e);
            }
          }
        } catch (e) {
          console.warn("生成语音失败", e);
        }
      }

      // --- 2. 处理画面 ---
      // 选择背景：product_image 类型用商品图，其余用渐变色块
      const useProductImage = shot.visualSource === "product_image" && localImages.length > 0;
      const imgPath = useProductImage ? localImages[Math.min(i, localImages.length - 1)] : null;

      const bgColors: Record<string, string> = {
        hook: "0x1a0a2e", pain_point: "0x2e1a0a", product_reveal: "0x0a1a2e",
        demo: "0x0a2e1a", social_proof: "0x1a0a2e", cta: "0x2e0a0a",
      };
      const bgColor = bgColors[shot.type] ?? "0x111827";

      let vf = imgPath 
        ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bgColor},setsar=1`
        : `scale=${W}:${H},setsar=1`;

      if (!imgPath && hasDrawtext && fontFile) {
        const descText = escapeFfmpegText(shot.description ?? `分镜 ${i + 1}`);
        vf += `,drawtext=fontfile='${fontFile}':fontsize=40:fontcolor=white@0.85:text='${descText}':x=(w-tw)/2:y=(h-th)/2:line_spacing=10`;
      }

      if (shot.voiceover && hasDrawtext && fontFile) {
        const voText = escapeFfmpegText(shot.voiceover.substring(0, 30));
        vf += `,drawtext=fontfile='${fontFile}':fontsize=36:fontcolor=white:text='${voText}':box=1:boxcolor=black@0.6:boxborderw=12:x=(w-tw)/2:y=h-th-80`;
      }

      // --- 3. 组合 FFmpeg 参数 ---
      let args = [];
      if (imgPath) {
        args.push("-loop", "1", "-i", imgPath);
      } else if (!hasDrawtext) {
        // 如果不支持文字绘制，使用动态测试画面(testsrc)代替纯色，避免看起来像死机黑屏
        args.push("-f", "lavfi", "-i", `testsrc=size=${W}x${H}:rate=30`);
      } else {
        args.push("-f", "lavfi", "-i", `color=c=${bgColor}:size=${W}x${H}:rate=30`);
      }

      // 解析 audioInput (-f lavfi -i anullsrc... 或者 -i audio.aiff)
      if (isAudioFile) {
        args.push("-i", audioInput.replace("-i \"", "").replace("\"", ""));
      } else {
        args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
      }

      args.push(
        "-t", String(duration),
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-y",
        clipPath
      );

      const result = spawnSync(ffmpegPath, args, {
        timeout: 60000,
        encoding: "utf8",
      });

      if (result.status !== 0) {
        console.error(`[compose] clip_${i} 生成失败:`, result.stderr?.slice(-500));
        clipPaths[i] = ""; // 标记失败
      }
    }

    // 生成 concat 列表（只包含成功生成的片段）
    const validClips = clipPaths.filter((p) => p && fs.existsSync(p));
    if (validClips.length === 0) {
      return NextResponse.json({ error: "所有分镜生成失败，请检查 FFmpeg 报错" }, { status: 500 });
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
        "-c:a", "aac",
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
