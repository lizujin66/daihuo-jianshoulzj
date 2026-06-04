import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// 获取指定项目的所有生成脚本
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = await db.select().from(scripts).where(eq(scripts.projectId, id));
    return NextResponse.json(result);
  } catch (error) {
    console.error("获取项目脚本失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取项目脚本失败" },
      { status: 500 }
    );
  }
}
