import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/project/:id/video-file
 * 返回已合成的 MP4 视频文件（用于下载）
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const videoPath = path.join(process.cwd(), "data", "videos", `${id}.mp4`);

  if (!fs.existsSync(videoPath)) {
    return NextResponse.json(
      { error: "视频文件不存在，请先点击"开始合成"" },
      { status: 404 }
    );
  }

  // 获取项目名称（用于下载文件名）
  let projectName = id;
  try {
    const db = getDb();
    const proj = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, id))
      .then((r) => r[0]);
    if (proj?.name) projectName = proj.name;
  } catch {}

  const stat = fs.statSync(videoPath);
  const fileStream = fs.createReadStream(videoPath);

  // 安全文件名：去除特殊字符
  const safeFileName = projectName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_\-]/g, "_");

  return new NextResponse(fileStream as any, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName)}.mp4`,
      "Cache-Control": "no-store",
    },
  });
}
