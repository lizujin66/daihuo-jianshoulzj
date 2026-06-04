"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  LuCheck, LuCircleCheck, LuFilm, LuDownload, LuFileText,
  LuPlus, LuHouse, LuSmartphone, LuShuffle, LuLoader, LuInfo
} from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// 平台导出配置（UI 展示用，实际导出功能需接入服务端）
const platformConfigs = [
  { id: "douyin", name: "抖音", ratio: "9:16", resolution: "1080p", subtitle: "居中+描边", color: "from-pink-500 to-red-500" },
  { id: "kuaishou", name: "快手", ratio: "9:16", resolution: "1080p", subtitle: "贴边框", color: "from-orange-500 to-amber-500" },
  { id: "xiaohongshu", name: "小红书", ratio: "3:4", resolution: "1440p", subtitle: "手写字体", color: "from-red-500 to-rose-500" },
];

const styleLabels: Record<string, string> = {
  pain_point: "痛点种草",
  scene: "场景安利",
  comparison: "对比测评",
  story: "剧情故事",
};

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [scripts, setScripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "info">("success");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/project/${id}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/project/${id}/script`).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([projData, scriptData]) => {
        if (projData) setProject(projData);
        if (Array.isArray(scriptData)) setScripts(scriptData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const mainScript = scripts[0];
  const totalDuration = mainScript?.totalDuration ?? 0;
  const shotCount = mainScript?.shots?.length ?? 0;
  const styleLabel = mainScript ? (styleLabels[mainScript.styleType] ?? mainScript.styleType) : "—";

  // 显示提示
  const showToast = (message: string, type: "success" | "info" = "success") => {
    setToast(message);
    setToastType(type);
    setTimeout(() => setToast(null), 3000);
  };

  // 导出脚本文案为文本
  const handleExportScript = () => {
    if (!mainScript) {
      showToast("暂无脚本数据可导出", "info");
      return;
    }
    const lines: string[] = [
      `项目：${project?.name ?? "未命名项目"}`,
      `脚本风格：${styleLabel}`,
      `总时长：${totalDuration}s`,
      `分镜数量：${shotCount}`,
      "",
      "=== 完整配音文案 ===",
      "",
    ];
    (mainScript.shots ?? []).forEach((shot: any, i: number) => {
      lines.push(`【第${i + 1}镜 · ${shot.type} · ${shot.duration}s】`);
      lines.push(shot.description ?? "");
      if (shot.voiceover) lines.push(`配音：${shot.voiceover}`);
      lines.push("");
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "脚本"}_文案.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("脚本文案已导出");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LuLoader className="animate-spin h-8 w-8 text-primary" />
          <span className="text-sm text-muted-foreground">正在加载项目数据...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg">
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-2">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm shadow-xl ${toastType === "info" ? "bg-blue-600" : "bg-emerald-600"}`}>
            {toastType === "info" ? <LuInfo className="w-4 h-4" /> : <LuCheck className="w-4 h-4" />}
            {toast}
          </div>
        </div>
      )}

      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight">带货剪手</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">{project?.name || "未命名项目"}</span>
          </div>

          {/* 步骤进度 */}
          <div className="flex items-center gap-1">
            {["脚本", "素材", "视频", "导出"].map((step, i) => (
              <div key={step} className="flex items-center">
                <div className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${i === 3 ? "bg-primary text-primary-foreground" : "text-primary"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${i === 3 ? "bg-white/20" : "bg-primary/20"}`}>
                    {i < 3 ? "✓" : i + 1}
                  </span>
                  {step}
                </div>
                {i < 3 && <div className="mx-1 h-px w-4 bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* 完成提示 */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 mb-4">
            <LuCircleCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            视频<span className="brand-gradient-text">生成完成</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            你的带货视频已准备就绪，可以下载脚本文案或分享项目
          </p>
        </div>

        {/* 视频预览占位 */}
        <Card className="glass-card neon-glow mb-6 overflow-hidden">
          <CardContent className="p-0">
            <div className="mx-auto max-w-xs">
              {/* 9:16 预览区域 */}
              <div className="relative aspect-[9/16] bg-gradient-to-b from-muted/40 via-muted/20 to-muted/40 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    <LuFilm className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-xs text-muted-foreground/70 font-medium">{project?.name}</p>
                    {mainScript && (
                      <p className="text-[11px] text-muted-foreground/40 mt-1">{styleLabel} · {totalDuration}s · {shotCount} 个镜头</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/30 mt-3">视频合成功能开发中</p>
                  </div>
                </div>

                {/* 播放按钮覆盖层 */}
                <button
                  onClick={() => showToast("视频合成功能开发中，敬请期待", "info")}
                  className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all group"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white" className="ml-1 group-hover:scale-110 transition-transform">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>

                {/* 时长标签 */}
                {totalDuration > 0 && (
                  <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/60 text-white text-xs">
                    0:{String(totalDuration).padStart(2, "0")}
                  </div>
                )}
              </div>
            </div>

            {/* 视频信息条 */}
            <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>1080p</span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span>9:16</span>
                {totalDuration > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>{totalDuration}s</span>
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {project?.updatedAt ? new Date(project.updatedAt).toLocaleDateString("zh-CN") : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 操作按钮 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-8">
          <Button
            onClick={() => showToast("视频下载功能开发中，请等待视频合成服务接入", "info")}
            className="brand-gradient text-white h-11 px-8 text-sm font-semibold opacity-60 cursor-not-allowed"
            disabled
          >
            <LuDownload className="w-[18px] h-[18px] mr-2" />
            下载视频（开发中）
          </Button>
          <Button
            variant="outline"
            onClick={handleExportScript}
            className="h-11 px-6 text-sm"
          >
            <LuFileText className="w-4 h-4 mr-2" />
            导出脚本文案
          </Button>
        </div>

        {/* 功能说明提示 */}
        <Card className="glass-card mb-6 border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <LuInfo className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <p className="font-medium text-amber-600 mb-1">功能说明</p>
                <p>当前版本已完成：脚本 AI 生成、项目管理、脚本数据持久化。</p>
                <p className="mt-1">待开发：① AI 图片/视频素材生成（接入 Kling/FLUX 等模型）② 视频合成（FFmpeg 服务端渲染）③ 视频下载。</p>
                <p className="mt-1">已可用功能：<strong>导出脚本文案</strong>（点击上方按钮即可下载）。</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 多平台导出（展示 UI） */}
        <Card className="glass-card mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <LuSmartphone className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">多平台导出</h3>
              <Badge variant="secondary" className="text-xs ml-1">开发中</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">一键生成适配各平台的视频版本（视频合成接入后开放）</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {platformConfigs.map(platform => (
                <div key={platform.id} className="p-3 rounded-lg border border-border/50 bg-muted/10 opacity-60">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
                      <span className="text-[10px] text-white font-bold">{platform.name[0]}</span>
                    </div>
                    <span className="text-sm font-medium">{platform.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>比例: {platform.ratio}</p>
                    <p>分辨率: {platform.resolution}</p>
                    <p>字幕: {platform.subtitle}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-xs"
                    disabled
                  >
                    导出{platform.name}版
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* A/B 测试版本（展示 UI） */}
        <Card className="glass-card mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <LuShuffle className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">A/B 测试版本</h3>
              <Badge variant="secondary" className="text-xs ml-1">开发中</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">自动生成不同开头/文案的变体，测试哪个转化率更高（敬请期待）</p>
            {mainScript?.shots?.slice(0, 1).map((shot: any) => (
              <div key="preview" className="p-3 rounded-lg border border-border/50 bg-muted/10 opacity-60">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">当前版本（基准）</span>
                  <Badge variant="secondary" className="text-xs">{styleLabel}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">开头: &quot;{shot.voiceover || shot.description}&quot;</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 视频详情 */}
        {mainScript && (
          <Card className="glass-card mb-8">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4">视频详情</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">项目名称</p>
                    <p className="text-sm truncate">{project?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">脚本风格</p>
                    <p className="text-sm">{styleLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">分镜数量</p>
                    <p className="text-sm">{shotCount} 个镜头</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">总时长</p>
                    <p className="text-sm">{totalDuration} 秒</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">商品名称</p>
                    <p className="text-sm truncate">{project?.productName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">商品类目</p>
                    <p className="text-sm">{project?.productCategory ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">生图模型</p>
                    <Badge variant="secondary" className="text-xs">待接入</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">生视频模型</p>
                    <Badge variant="secondary" className="text-xs">待接入</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 底部导航 */}
        <div className="flex items-center justify-center gap-4">
          <Link href="/project/new">
            <Button className="brand-gradient text-white">
              <LuPlus className="w-4 h-4 mr-1.5" />
              再做一个
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline">
              <LuHouse className="w-4 h-4 mr-1.5" />
              返回项目列表
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
