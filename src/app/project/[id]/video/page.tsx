"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { LuArrowLeft, LuPlay, LuChevronDown, LuArrowRight, LuLoader, LuFileText, LuCheck, LuCircleAlert } from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Shot } from "@/lib/db/schema";

interface VideoClipItem {
  shotId: number;
  type: Shot["type"];
  duration: number;
  voiceover: string;
  transition: "ai_start_end" | "ai_reference" | "direct_concat" | "ffmpeg_fade";
}

interface ComposeConfig {
  ttsEnabled: boolean;
  ttsVoice: string;
  bgm: string;
  subtitlePosition: "bottom" | "center" | "top";
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p";
}

const transitionLabels: Record<string, string> = {
  ai_start_end: "AI 智能过渡",
  ai_reference: "AI 参考过渡",
  direct_concat: "直接拼接",
  ffmpeg_fade: "渐变过渡",
};

const shotTypeLabels: Record<Shot["type"], { label: string; color: string }> = {
  hook: { label: "钩子", color: "bg-red-500/20 text-red-400" },
  pain_point: { label: "痛点", color: "bg-orange-500/20 text-orange-400" },
  product_reveal: { label: "产品", color: "bg-blue-500/20 text-blue-400" },
  demo: { label: "演示", color: "bg-green-500/20 text-green-400" },
  social_proof: { label: "背书", color: "bg-purple-500/20 text-purple-400" },
  cta: { label: "转化", color: "bg-amber-500/20 text-amber-400" },
};

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [clips, setClips] = useState<VideoClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ComposeConfig>({
    ttsEnabled: false,
    ttsVoice: "female-gentle",
    bgm: "none",
    subtitlePosition: "bottom",
    aspectRatio: "9:16",
    resolution: "1080p",
  });

  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const [composeDone, setComposeDone] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<{ fileSizeMB: string; shotCount: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/project/${id}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/project/${id}/script`).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([projData, scriptData]) => {
        if (projData) setProject(projData);
        if (Array.isArray(scriptData) && scriptData.length > 0) {
          const script = scriptData[0];
          const videoClips: VideoClipItem[] = (script.shots ?? []).map((shot: any) => ({
            shotId: shot.shotId,
            type: shot.type,
            duration: shot.duration,
            voiceover: shot.voiceover ?? "",
            transition: (shot.transition ?? "ai_start_end") as VideoClipItem["transition"],
          }));
          setClips(videoClips);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

  const updateTransition = (shotId: number, transition: string) => {
    setClips((prev) =>
      prev.map((c) =>
        c.shotId === shotId ? { ...c, transition: transition as VideoClipItem["transition"] } : c
      )
    );
  };

  // 调用真实的视频合成 API
  const startCompose = async () => {
    setIsComposing(true);
    setComposeProgress(0);
    setComposeDone(false);
    setComposeError(null);

    // 模拟进度条（实际上是服务端在处理）
    const progressInterval = setInterval(() => {
      setComposeProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 8;
      });
    }, 800);

    try {
      const res = await fetch(`/api/project/${id}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "合成失败，请重试");
      }

      const data = await res.json();
      setComposeProgress(100);
      setComposeDone(true);
      setVideoInfo({ fileSizeMB: data.fileSizeMB, shotCount: data.shotCount });
    } catch (err) {
      clearInterval(progressInterval);
      setComposeError(err instanceof Error ? err.message : "合成失败，请重试");
      setIsComposing(false);
      setComposeProgress(0);
    } finally {
      setIsComposing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LuLoader className="animate-spin h-8 w-8 text-primary" />
          <span className="text-sm text-muted-foreground">正在加载视频数据...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg">
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
                <div className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${i === 2 ? "bg-primary text-primary-foreground" : i < 2 ? "text-primary" : "text-muted-foreground"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${i === 2 ? "bg-white/20" : i < 2 ? "bg-primary/20" : "bg-muted"}`}>
                    {i < 2 ? "✓" : i + 1}
                  </span>
                  {step}
                </div>
                {i < 3 && <div className="mx-1 h-px w-4 bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {clips.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                <LuFileText className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-2">还没有脚本数据</h3>
              <p className="text-sm text-muted-foreground mb-6">请先生成脚本，再进行视频合成</p>
              <Link href={`/project/${id}/script`}>
                <Button variant="outline"><LuArrowLeft className="w-4 h-4 mr-1" />返回脚本页面</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：时间线 */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">视频时间线</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{clips.length} 个片段 · 总时长 {totalDuration}s</p>
                </div>
                <Link href={`/project/${id}/assets`}>
                  <Button variant="outline" size="sm" className="text-xs">
                    <LuArrowLeft className="w-3.5 h-3.5 mr-1" />返回素材
                  </Button>
                </Link>
              </div>

              <div className="space-y-1">
                {clips.map((clip, index) => {
                  const typeInfo = shotTypeLabels[clip.type] ?? { label: clip.type, color: "bg-zinc-500/20 text-zinc-400" };
                  return (
                    <div key={clip.shotId}>
                      <Card className="glass-card">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-20 h-14 bg-muted/30 rounded-md shrink-0 flex items-center justify-center border border-border/30">
                              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 rounded-md flex items-center justify-center">
                                <LuPlay className="w-4 h-4 text-primary/60" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={`${typeInfo.color} border-0 text-[10px]`}>{typeInfo.label}</Badge>
                                <span className="text-xs text-muted-foreground">{clip.duration}s</span>
                              </div>
                              {clip.voiceover ? (
                                <p className="text-xs text-muted-foreground truncate">🎙 {clip.voiceover}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground/40 italic">无配音文案</p>
                              )}
                            </div>
                            <span className="text-sm font-bold text-muted-foreground/30 shrink-0">
                              {String(clip.shotId).padStart(2, "0")}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      {index < clips.length - 1 && (
                        <div className="flex items-center justify-center py-1.5">
                          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/20 border border-border/30">
                            <LuChevronDown className="w-3 h-3 text-muted-foreground" />
                            <select
                              value={clip.transition}
                              onChange={(e) => updateTransition(clip.shotId, e.target.value)}
                              className="text-[11px] text-muted-foreground bg-transparent border-none outline-none cursor-pointer"
                            >
                              {Object.entries(transitionLabels).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右侧：合成配置 */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-base font-semibold">合成设置</h2>

              <Card className="glass-card">
                <CardContent className="p-4 space-y-3">
                  <Label className="text-sm font-medium">字幕位置</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["bottom", "center", "top"] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setConfig((c) => ({ ...c, subtitlePosition: pos }))}
                        className={`h-9 rounded-md text-xs border transition-all ${config.subtitlePosition === pos ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"}`}
                      >
                        {pos === "bottom" ? "底部" : pos === "center" ? "居中" : "顶部"}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="p-4 space-y-4">
                  <Label className="text-sm font-medium">画面设置</Label>
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">画面比例</span>
                    <div className="grid grid-cols-3 gap-2">
                      {(["9:16", "16:9", "1:1"] as const).map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setConfig((c) => ({ ...c, aspectRatio: ratio }))}
                          className={`h-9 rounded-md text-xs border transition-all ${config.aspectRatio === ratio ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"}`}
                        >
                          {ratio === "9:16" ? "竖屏" : ratio === "16:9" ? "横屏" : "方形"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">分辨率</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(["720p", "1080p"] as const).map((res) => (
                        <button
                          key={res}
                          onClick={() => setConfig((c) => ({ ...c, resolution: res }))}
                          className={`h-9 rounded-md text-xs border transition-all ${config.resolution === res ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"}`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 合成状态 */}
              <div className="space-y-3">
                {/* 错误提示 */}
                {composeError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <LuCircleAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400">{composeError}</p>
                  </div>
                )}

                {/* 进度条 */}
                {(isComposing || composeDone) && !composeError && (
                  <div>
                    <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${composeDone ? "bg-emerald-500" : "brand-gradient"}`}
                        style={{ width: `${Math.min(composeProgress, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">
                        {composeDone
                          ? `✅ 合成完成！${videoInfo ? `共 ${videoInfo.shotCount} 个片段，${videoInfo.fileSizeMB} MB` : ""}`
                          : `正在合成视频... ${Math.round(composeProgress)}%`}
                      </p>
                      {composeDone && <LuCheck className="w-4 h-4 text-emerald-500" />}
                    </div>
                  </div>
                )}

                <Button
                  onClick={startCompose}
                  disabled={isComposing}
                  className="w-full brand-gradient text-white"
                >
                  {isComposing ? (
                    <>
                      <svg className="animate-spin mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      合成中（请稍候...）
                    </>
                  ) : composeDone ? (
                    "重新合成"
                  ) : (
                    <><LuPlay className="w-4 h-4 mr-1" />开始合成</>
                  )}
                </Button>

                {composeDone && (
                  <Link href={`/project/${id}/export`}>
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                      下一步：导出视频
                      <LuArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
