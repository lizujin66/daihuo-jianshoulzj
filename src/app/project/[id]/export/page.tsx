"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  LuCheck, LuCircleCheck, LuFilm, LuDownload, LuFileText,
  LuPlus, LuHouse, LuSmartphone, LuShuffle, LuLoader, LuInfo, LuCircleAlert
} from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const [videoReady, setVideoReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "info" | "error">("success");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/project/${id}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/project/${id}/script`).then((res) => (res.ok ? res.json() : [])),
      // 检查视频文件是否已生成
      fetch(`/api/project/${id}/video-file`, { method: "HEAD" })
        .then((res) => setVideoReady(res.ok))
        .catch(() => setVideoReady(false)),
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

  const showToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setToast(message);
    setToastType(type);
    setTimeout(() => setToast(null), 3000);
  };

  // 真实下载视频
  const handleDownloadVideo = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/project/${id}/video-file`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "视频文件不存在");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name ?? id}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("视频下载成功！");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "下载失败，请重试", "error");
    } finally {
      setIsDownloading(false);
    }
  };

  // 导出脚本文案
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
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm shadow-xl ${
            toastType === "error" ? "bg-red-600" : toastType === "info" ? "bg-blue-600" : "bg-emerald-600"
          }`}>
            {toastType === "error" ? <LuCircleAlert className="w-4 h-4" /> : toastType === "info" ? <LuInfo className="w-4 h-4" /> : <LuCheck className="w-4 h-4" />}
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
          <div className={`inline-flex h-16 w-16 items-center justify-center rounded-full mb-4 ${videoReady ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
            <LuCircleCheck className={`w-8 h-8 ${videoReady ? "text-emerald-500" : "text-amber-500"}`} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            视频<span className="brand-gradient-text">{videoReady ? "生成完成" : "待合成"}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {videoReady ? '视频已生成完毕，点击下方按钮立即下载' : '请先返回视频合成页点击「开始合成」，完成后再来下载'}
          </p>
        </div>

        {/* 未生成视频时的提示 */}
        {!videoReady && (
          <Card className="glass-card mb-6 border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <LuInfo className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-amber-600">视频尚未合成。</span> 请先返回上一步完成视频合成，合成成功后下载按钮将自动启用。
              </div>
              <Link href={`/project/${id}/video`} className="shrink-0">
                <Button size="sm" variant="outline" className="text-xs">去合成</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* 视频预览区 */}
        <Card className="glass-card neon-glow mb-6 overflow-hidden">
          <CardContent className="p-0">
            <div className="mx-auto max-w-xs">
              <div className="relative aspect-[9/16] bg-gradient-to-b from-muted/40 via-muted/20 to-muted/40 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    <LuFilm className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-xs text-muted-foreground/70 font-medium">{project?.name}</p>
                    {mainScript && (
                      <p className="text-[11px] text-muted-foreground/40 mt-1">{styleLabel} · {totalDuration}s · {shotCount} 个镜头</p>
                    )}
                    {videoReady && (
                      <Badge className="mt-3 bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-[10px]">✓ 视频已就绪</Badge>
                    )}
                  </div>
                </div>

                {totalDuration > 0 && (
                  <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/60 text-white text-xs">
                    0:{String(totalDuration).padStart(2, "0")}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>1080p</span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span>9:16</span>
                {totalDuration > 0 && (
                  <><span className="w-1 h-1 rounded-full bg-muted-foreground/30" /><span>{totalDuration}s</span></>
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
            onClick={handleDownloadVideo}
            disabled={!videoReady || isDownloading}
            className={`brand-gradient text-white h-11 px-8 text-sm font-semibold ${!videoReady ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {isDownloading ? (
              <><LuLoader className="animate-spin w-[18px] h-[18px] mr-2" />下载中...</>
            ) : (
              <><LuDownload className="w-[18px] h-[18px] mr-2" />{videoReady ? "下载视频" : "视频未合成"}</>
            )}
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

        {/* 多平台导出 */}
        <Card className="glass-card mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <LuSmartphone className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">多平台导出</h3>
              <Badge variant="secondary" className="text-xs ml-1">开发中</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">一键生成适配各平台的视频版本</p>
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
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-2 text-xs" disabled>
                    导出{platform.name}版
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* A/B 测试 */}
        <Card className="glass-card mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <LuShuffle className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">A/B 测试版本</h3>
              <Badge variant="secondary" className="text-xs ml-1">开发中</Badge>
            </div>
            <p className="text-xs text-muted-foreground">自动生成不同开头/文案的变体，测试转化率（敬请期待）</p>
          </CardContent>
        </Card>

        {/* 视频详情 */}
        {mainScript && (
          <Card className="glass-card mb-8">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4">视频详情</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div><p className="text-xs text-muted-foreground mb-0.5">项目名称</p><p className="text-sm truncate">{project?.name ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">脚本风格</p><p className="text-sm">{styleLabel}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">分镜数量</p><p className="text-sm">{shotCount} 个镜头</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">总时长</p><p className="text-sm">{totalDuration} 秒</p></div>
                </div>
                <div className="space-y-3">
                  <div><p className="text-xs text-muted-foreground mb-0.5">商品名称</p><p className="text-sm truncate">{project?.productName ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">商品类目</p><p className="text-sm">{project?.productCategory ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">视频状态</p>
                    <Badge className={videoReady ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-xs" : "bg-amber-500/20 text-amber-400 border-amber-500/20 text-xs"}>
                      {videoReady ? "✓ 已生成" : "待合成"}
                    </Badge>
                  </div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">视频格式</p><p className="text-sm">MP4 · H.264 · 1080p</p></div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 底部导航 */}
        <div className="flex items-center justify-center gap-4">
          <Link href="/project/new">
            <Button className="brand-gradient text-white">
              <LuPlus className="w-4 h-4 mr-1.5" />再做一个
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline">
              <LuHouse className="w-4 h-4 mr-1.5" />返回项目列表
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
