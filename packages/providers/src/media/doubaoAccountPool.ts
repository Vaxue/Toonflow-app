const rules = [
  {
    type: "input",
    field: "baseUrl" as const,
    title: "账号池地址",
    value: "http://127.0.0.1:17888",
    props: { placeholder: "http://127.0.0.1:17888" },
  },
  {
    type: "input",
    field: "apiKey" as const,
    title: "API Key",
    value: "local-doubao-key",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  },
] as const;

const version = "1.0.0";
const maxImages = 9;
const maxVideos = 3;

function poolUrl(context: ProviderContext, path: string) {
  const baseUrl = typeof context.config.baseUrl === "string" ? context.config.baseUrl.trim().replace(/\/+$/, "") : "";
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("请填写有效的豆包账号池 HTTP(S) 地址");
  return `${baseUrl}${path}`;
}

function headers(context: ProviderContext) {
  const apiKey = typeof context.config.apiKey === "string" ? context.config.apiKey.trim().replace(/^Bearer\s+/i, "") : "";
  if (!apiKey) throw new Error("请填写豆包账号池 API Key");
  return { Authorization: `Bearer ${apiKey}` };
}

function filename(input: MediaInput, index: number) {
  const fallback = `reference-${index + 1}.${input.mimeType?.split("/")[1] || "png"}`;
  return input.name?.trim() || fallback;
}

async function appendImage(form: FormData, input: MediaInput, index: number, context: ProviderContext) {
  const name = filename(input, index);
  if (input.type === "url") {
    if (!/^https?:\/\//i.test(input.url)) throw new Error(`第 ${index + 1} 张参考图 URL 必须使用 HTTP 或 HTTPS`);
    const response = await context.tool.fetch(input.url, { signal: context.signal });
    if (!response.ok) throw new Error(`读取第 ${index + 1} 张参考图失败：HTTP ${response.status}`);
    const mimeType = response.headers.get("content-type")?.split(";")[0] || input.mimeType || "image/png";
    form.append("referenceImages", new Blob([await response.arrayBuffer()], { type: mimeType }), name);
    return;
  }
  const bytes = input.type === "binary" ? input.data : Buffer.from(input.data.replace(/^data:[^;,]+;base64,/, ""), "base64");
  const data = Uint8Array.from(bytes).buffer;
  form.append("referenceImages", new Blob([data], { type: input.mimeType }), name);
}

async function appendVideo(form: FormData, input: MediaInput, index: number, context: ProviderContext) {
  const name = input.name?.trim() || `reference-video-${index + 1}.mp4`;
  if (input.type === "url") {
    if (!/^https?:\/\//i.test(input.url)) throw new Error(`第 ${index + 1} 段参考视频 URL 必须使用 HTTP 或 HTTPS`);
    const response = await context.tool.fetch(input.url, { signal: context.signal });
    if (!response.ok) throw new Error(`读取第 ${index + 1} 段参考视频失败：HTTP ${response.status}`);
    const mimeType = response.headers.get("content-type")?.split(";")[0] || input.mimeType || "video/mp4";
    form.append("referenceVideos", new Blob([await response.arrayBuffer()], { type: mimeType }), name);
    return;
  }
  const bytes = input.type === "binary" ? input.data : Buffer.from(input.data.replace(/^data:[^;,]+;base64,/, ""), "base64");
  const data = Uint8Array.from(bytes).buffer;
  form.append("referenceVideos", new Blob([data], { type: input.mimeType || "video/mp4" }), name);
}

type ReferencedVideoRequest = VideoRequest & {
  referenceOrder?: ({ type: "image" | "video" | "audio"; index: number } | { type: "text" | "firstFrame" | "lastFrame" })[];
};

function promptWithImageLabels(prompt: string, referenceOrder?: ReferencedVideoRequest["referenceOrder"]) {
  return prompt.replace(/\{\{ref (\d+)\}\}/g, (marker, number: string) => {
    const reference = referenceOrder?.[Number(number) - 1];
    if (!reference || (reference.type !== "image" && reference.type !== "video") || !("index" in reference)) {
      throw new Error(`引用标记 ${marker} 必须对应已提交的图片或视频参考`);
    }
    return `${reference.type === "video" ? "视频" : "图片"}${reference.index + 1}`;
  });
}

function wait(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 3000);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export default {
  id: "doubaoAccountPool" as const,
  label: "豆包账号池（本机）",
  icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzE2Njg1NyIvPjxwYXRoIGQ9Ik0xNiAxN2gxNnYxNEgxNnoiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJtMjAgMjQgNCA0IDgtOSIgc3Ryb2tlPSIjMTY2ODU3IiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiLz48L3N2Zz4=",
  version,
  readme: "通过本机运行的豆包账号池提交 Seedance 视频任务，支持最多 9 张图片参考，以及最多 3 段参考视频（Seedance 2.0 的视频参考可用于锁运镜与动作）。请先启动豆包账号池服务；远程访问时请使用受保护的 HTTPS 代理。",
  rules,
  models: [
    {
      id: "seedance_2_0_mini",
      label: "Seedance 2.0 mini",
      type: "video",
      mode: ["text", ["imageReference:9", "videoReference:3"]],
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["720p", "1080p"] }],
    },
    {
      id: "seedance_2_0_fast",
      label: "Seedance 2.0 fast",
      type: "video",
      mode: ["text", ["imageReference:9", "videoReference:3"]],
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["720p", "1080p"] }],
    },
  ] satisfies ProviderModel[],
  async generateVideo(request: ReferencedVideoRequest): Promise<MediaAsset[]> {
    const images = request.images ?? [];
    const videos = request.videos ?? [];
    if (images.length > maxImages) throw new Error(`豆包账号池最多支持 ${maxImages} 张参考图`);
    if (videos.length > maxVideos) throw new Error(`豆包账号池最多支持 ${maxVideos} 段参考视频`);
    if (request.audios?.length || request.firstFrame || request.lastFrame) {
      throw new Error("豆包账号池当前支持图片与视频参考，不支持音频或首尾帧素材");
    }
    if (request.generateAudio !== undefined || request.watermark !== undefined || Object.keys(request.other ?? {}).length) {
      throw new Error("豆包账号池当前未映射音频、水印或自定义参数");
    }
    const prompt = promptWithImageLabels(request.prompt, request.referenceOrder);
    const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(this.signal ? [this.signal] : [])]);
    const duration = request.duration ?? 15;
    if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error("视频时长必须为 4 到 15 秒的整数");
    const resolution = request.resolution ?? "720p";
    if (resolution !== "720p" && resolution !== "1080p") throw new Error("视频分辨率只支持 720p 或 1080p");
    const form = new FormData();
    form.set("model", request.model);
    form.set("aspectRatio", request.ratio === "9:16" ? "9:16" : "16:9");
    form.set("duration", String(duration));
    form.set("resolution", resolution);
    form.set("prompt", prompt);
    form.set("source", "toonflow");
    for (let index = 0; index < images.length; index += 1) await appendImage(form, images[index], index, this);
    for (let index = 0; index < videos.length; index += 1) await appendVideo(form, videos[index], index, this);

    const submit = await this.tool.fetch(poolUrl(this, "/api/generate"), {
      method: "POST",
      headers: headers(this),
      body: form,
      signal,
    });
    const initial = await submit.json() as { requestId?: string; error?: string; status?: string };
    if (!submit.ok || !initial.requestId) throw new Error(initial.error || `提交豆包任务失败：HTTP ${submit.status}`);

    while (true) {
      signal.throwIfAborted();
      const response = await this.tool.fetch(poolUrl(this, `/api/requests/${encodeURIComponent(initial.requestId)}`), {
        headers: headers(this),
        signal,
      });
      const task = await response.json() as { status?: string; cleanVideoUrl?: string | null; error?: unknown; message?: string };
      if (!response.ok) throw new Error(typeof task.error === "string" ? task.error : `查询豆包任务失败：HTTP ${response.status}`);
      if (task.status === "success") {
        if (!task.cleanVideoUrl || !/^https?:\/\//i.test(task.cleanVideoUrl)) throw new Error("豆包账号池任务成功，但没有可访问的 MP4 地址");
        return [{ mediaType: "video", type: "url", url: task.cleanVideoUrl }];
      }
      if (["failed", "stopped"].includes(task.status ?? "")) {
        throw new Error(typeof task.error === "string" ? task.error : task.message || "豆包视频生成失败");
      }
      await wait(signal);
    }
  },
} satisfies ProviderDefinition<typeof rules>;
