import { fmtC } from "../util";
import type { Release, TocInfo } from "../api";
import { useEffect, useRef, useState } from "react";

export function InfoView({
  disc,
  release,
  cover,
  onSearch,
  onMbSubmit,
  onMbOpen,
}: {
  disc: TocInfo;
  release: Release | null;
  cover: string | null;
  onSearch: () => void;
  onMbSubmit: () => void;
  onMbOpen: () => void;
}) {
  if (!release) {
    return (
      <div className="info-page">
        <div className="meta-card">
          <div className="meta-card-title">未识别专辑</div>
          <div className="meta-card-sub">
            DiscID: <code>{disc.discid}</code>
          </div>
          <div className="meta-card-actions">
            <button className="btn" onClick={onSearch}>
              🔎 搜索专辑
            </button>
            <button className="btn btn-ghost" onClick={onMbSubmit}>
              ⬆ 提交 DiscID
            </button>
          </div>
        </div>
      </div>
    );
  }
  const artists = release.artistCredit?.map((a) => a.name).join(" / ") || "";
  const rows: [string, string][] = [
    ["发行日期", release.date ?? "—"],
    ["国家/地区", release.country ?? "—"],
    ["版本", release.disambiguation ?? "—"],
    ["条码", release.barcode ?? "—"],
    ["DiscID", disc.discid],
    ["格式", release.media?.[0]?.format ?? "—"],
  ];
  return (
    <div className="info-page">
      <div className="page-head">
        <div className="page-title2">专辑信息</div>
        <div className="page-sub2">发行信息一览 · MusicBrainz 元数据</div>
      </div>
      <div className="info-hero">
        {cover ? (
          <img className="info-cover" src={cover} alt="" />
        ) : (
          <div className="info-cover info-cover-empty">♫</div>
        )}
        <div className="info-hero-meta">
          <div className="info-title">{release.title}</div>
          <div className="info-artist">{artists}</div>
          <div className="info-sub">
            {[release.date, release.country].filter(Boolean).join(" · ")}
            {release.disambiguation ? ` · ${release.disambiguation}` : ""}
          </div>
        </div>
      </div>

      <div className="info-rows">
        {rows.map(([k, v]) => (
          <div className="info-row" key={k}>
            <span className="info-k">{k}</span>
            <span className="info-v">{v}</span>
          </div>
        ))}
      </div>

      <div className="meta-card-actions">
        <button className="btn btn-ghost" onClick={onMbOpen}>
          ↗ MusicBrainz 打开
        </button>
        <button className="btn" onClick={onMbSubmit}>
          ⬆ 提交 DiscID
        </button>
      </div>
    </div>
  );
}

export function QueueView({
  disc,
  release,
  cover,
  playing,
  onPlay,
}: {
  disc: TocInfo;
  release: Release | null;
  cover: string | null;
  playing: { no: number; title: string } | null;
  onPlay: (no: number) => void;
}) {
  const metaTracks = release?.media?.[0]?.tracks ?? [];
  const artists = release?.artistCredit?.map((a) => a.name).join(" / ") || "";
  return (
    <div className="queue-wrap">
      <div className="page-head">
        <div className="page-title2">播放队列</div>
        <div className="page-sub2">{disc.trackCount} 首 · 点击曲目播放</div>
      </div>
      <div className="queue-page">
        <div className="queue-left">
          {cover ? (
            <img className="info-cover" src={cover} alt="" />
          ) : (
            <div className="info-cover info-cover-empty">♫</div>
          )}
          <div className="info-artist q-artist">
            {release?.title ?? "未识别专辑"}
          </div>
          {artists ? <div className="q-artist2">{artists}</div> : null}
        </div>

      <div className="queue-card">
        {disc.tracks.map((t, i) => {
          const title = metaTracks[i]?.title ?? `曲目 ${t.no}`;
          const isPlay = playing?.no === t.no;
          return (
            <div
              key={t.no}
              className={"queue-row" + (isPlay ? " playing" : "")}
              onClick={() => onPlay(t.no)}
              title="播放"
            >
              <span className="pt-no">{isPlay ? "▶" : String(t.no).padStart(2, "0")}</span>
              <span className="pt-title">{title}</span>
              <span className="pt-dur">{fmtC(t.durationMs / 1000)}</span>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}


/** 自定义下拉 (替代原生 select) */
function FontPicker({
  fonts,
  value,
  onChange,
}: {
  fonts: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    if (!open) return;
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="font-picker" ref={ref}>
      <button
        className="font-picker-btn"
        style={value ? { fontFamily: value } : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{value || "默认 (系统字体)"}</span>
        <span className="fp-arrow">▾</span>
      </button>
      {open && (
        <div className="font-picker-list" onMouseDown={(e) => e.stopPropagation()}>
          <div
            className={"fp-opt" + (value === "" ? " on" : "")}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            默认 (系统字体)
          </div>
          {fonts.map((f) => (
            <div
              key={f}
              className={"fp-opt" + (value === f ? " on" : "")}
              style={{ fontFamily: f }}
              onClick={() => {
                onChange(f);
                setOpen(false);
              }}
            >
              {f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/** 单色小图标 (设置页按钮统一风格) */
const UpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2.5l3 3-3 3" />
    <path d="M3 11V9.5A4.5 4.5 0 0 1 7.5 5H20" />
    <path d="M7 19.5l-3-3 3-3" />
    <path d="M21 11v1.5A4.5 4.5 0 0 1 16.5 17H4" />
  </svg>
);

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={"toggle" + (on ? " on" : "")} onClick={() => onChange(!on)}>
      <span className="toggle-knob" />
    </button>
  );
}

export function SettingsView({
  disc,
  release,
  settings,
  upSettings,
  onRescan,
  onMbSubmit,
  onUploadCover,
}: {
  disc: TocInfo | null;
  release: Release | null;
  settings: any;
  upSettings: (p: any) => void;
  onRescan: () => void;
  onMbSubmit: () => void;
  onUploadCover: (dataUrl: string) => void;
}) {
  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const [localArtist, setLocalArtist] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => {
    void import("../api").then((m) => m.listFonts()).then(setFonts).catch(() => {});
  }, []);

  const saveMeta = () => {
    upSettings({
      albumTitle: localTitle !== null ? localTitle : settings.albumTitle ?? "",
      artistName: localArtist !== null ? localArtist : settings.artistName ?? "",
    });
  };

  return (
    <div className="info-page settings-page">
      <div className="page-head">
        <div className="page-title2">设置</div>
        <div className="page-sub2">外观 · 播放 · 光盘元数据</div>
      </div>

      <div className="set-card">
        <div className="set-title">外观</div>
        <div className="set-row col">
          <span className="set-label">应用字体 (调用电脑字体)</span>
          <FontPicker
            fonts={fonts}
            value={settings.fontFamily ?? ""}
            onChange={(v) => upSettings({ fontFamily: v })}
          />
        </div>
        <div className="set-row">
          <span>软件字号</span>
          <div className="seg">
            {[["标准", ""], ["大号", "lg"], ["特大", "xl"]].map(([label, v]) => (
              <button
                key={label}
                className={"seg-btn" + ((settings.font ?? "") === v ? " on" : "")}
                onClick={() => upSettings({ font: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="set-row">
          <span>强调色</span>
          <div className="swatches">
            {["#4cc2ff", "#8b5cf6", "#34d8bd", "#ff6b9d", "#ffb84c"].map((c) => (
              <button
                key={c}
                className={"swatch" + ((settings.accent ?? "#4cc2ff") === c ? " on" : "")}
                style={{ background: c }}
                onClick={() => upSettings({ accent: c })}
              />
            ))}
          </div>
        </div>
        <div className="set-row">
          <span>背景光效 (Apple Music 式动画)</span>
          <Toggle on={settings.ambient !== false} onChange={(v) => upSettings({ ambient: v })} />
        </div>
      </div>

      <div className="set-card">
        <div className="set-title">播放</div>
        <div className="set-row">
          <span>自动播放下一首</span>
          <Toggle on={settings.autoNext !== false} onChange={(v) => upSettings({ autoNext: v })} />
        </div>
        <div className="set-row">
          <span>自动加载歌词</span>
          <Toggle on={settings.autoLyrics !== false} onChange={(v) => upSettings({ autoLyrics: v })} />
        </div>
      </div>

      <div className="set-card">
        <div className="set-title">光盘与元数据</div>
        <div className="set-row col">
          <span className="set-label">手动编辑专辑名 / 艺术家 (本地覆盖)</span>
          <input
            className="set-input"
            placeholder={release?.title ?? "专辑名"}
            value={localTitle ?? settings.albumTitle ?? ""}
            onChange={(e) => setLocalTitle(e.target.value)}
          />
          <input
            className="set-input"
            placeholder={release?.artistCredit?.map((a) => a.name).join(" / ") ?? "艺术家"}
            value={localArtist ?? settings.artistName ?? ""}
            onChange={(e) => setLocalArtist(e.target.value)}
          />
          <button className="btn" onClick={saveMeta}>保存</button>
        </div>
        <div className="set-row">
          <span>手动上传封面 (存为本地, 永久复用)</span>
          <button className="btn btn-ghost btn-ghost-fixed" onClick={() => fileRef.current?.click()}>
            <UpIcon /> 选择图片
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const rd = new FileReader();
              rd.onload = () => onUploadCover(String(rd.result));
              rd.readAsDataURL(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="set-row">
          <span>重新读盘</span>
          <button className="btn btn-ghost btn-ghost-fixed" onClick={onRescan}>
            <RefreshIcon /> 重新读盘
          </button>
        </div>
        <div className="set-row">
          <span>提交 DiscID 到 MusicBrainz</span>
          <button className="btn btn-ghost btn-ghost-fixed" onClick={onMbSubmit}>
            <UpIcon /> 提交
          </button>
        </div>
      </div>

      <div className="set-card">
        <div className="set-title">关于</div>
        <div className="set-row">
          <span>光驱设备</span>
          <span className="set-val">{disc?.device ?? "未检测到"}</span>
        </div>
        <div className="set-row">
          <span>DiscID</span>
          <span className="set-val">{disc?.discid ?? "—"}</span>
        </div>
        <div className="set-row">
          <span>版本</span>
          <span className="set-val">SoundDisc 0.1 · Tauri 2 · libmpv</span>
        </div>
      </div>
    </div>
  );
}

export function TracksView({
  disc,
  release,
  playing,
  onPlay,
}: {
  disc: TocInfo;
  release: Release | null;
  playing: { no: number; title: string } | null;
  onPlay: (no: number) => void;
}) {
  const [q, setQ] = useState("");
  const metaTracks = release?.media?.[0]?.tracks ?? [];
  const list = disc.tracks.filter((t, i) => {
    if (!q.trim()) return true;
    const title = metaTracks[i]?.title ?? `曲目 ${t.no}`;
    return title.toLowerCase().includes(q.trim().toLowerCase()) || String(t.no) === q.trim();
  });
  return (
    <div className="page">
      <h2 className="page-title">曲目列表</h2>
      <input
        className="track-search wide"
        placeholder="🔍 搜索曲目…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 14 }}
      />
      <ol className="page-tracks">
        {list.map((t) => {
          const mt = metaTracks[disc.tracks.indexOf(t)];
          const title = mt?.title ?? `曲目 ${t.no}`;
          const isPlay = playing?.no === t.no;
          return (
            <li key={t.no}>
              <div
                className={"page-track" + (isPlay ? " playing" : "")}
                onClick={() => onPlay(t.no)}
                title="播放"
              >
                <span className="pt-no">{isPlay ? "▶" : String(t.no).padStart(2, "0")}</span>
                <span className="pt-title">{title}</span>
                <span className="pt-dur">{fmtC(t.durationMs / 1000)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
