import type { Release, TocInfo } from "../api";

const fmt = (ms: number) => {
  if (!isFinite(ms) || ms <= 0) return "--:--";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** 首页: 左侧封面 + 右侧曲目列表 (只展示, 不改播放队列) */
export function HomeView({
  cover,
  disc,
  release,
  playing,
  onPlayTrack,
  onSearch,
}: {
  cover: string | null;
  disc: TocInfo;
  release: Release | null;
  playing: { no: number; title: string } | null;
  onPlayTrack: (no: number) => void;
  onSearch?: () => void;
}) {
  const tracks = release?.media?.[0]?.tracks ?? [];
  const album = release?.title ?? "音频 CD";
  const artist =
    release?.artistCredit?.map((a) => a.name).join(" / ") ?? "";
  const year = release?.date?.slice(0, 4) ?? "";
  const count = disc.trackCount;

  return (
    <div className="home">
      <div className="home-left">
        <div className="home-cover">
          {cover ? (
            <img className="cover-vt" src={cover} alt="" />
          ) : (
            <div className="cover-vt home-cover-empty">♫</div>
          )}
        </div>
        <div className="home-meta">
          <div className="home-album" title={album}>
            {album}
          </div>
          {artist ? (
            <div className="home-artist" title={artist}>
              {artist}
            </div>
          ) : null}
          <div className="home-sub">
            {year ? `${year} · ` : ""}
            {count} 首曲目
          </div>
          {!release && onSearch ? (
            <button className="home-identify-btn" onClick={onSearch}>
              ⌕ 搜索专辑
            </button>
          ) : null}
        </div>
      </div>

      <div className="home-right">
        <div className="home-tracks-head">
          <span>曲目</span>
          <span>{count} 首</span>
        </div>
        <div className="home-tracks">
          {Array.from({ length: count }, (_, i) => {
            const no = i + 1;
            const t = tracks[i];
            const ms = disc.tracks[i]?.durationMs ?? t?.length ?? 0;
            const title = t?.title ?? `曲目 ${no}`;
            const active = playing?.no === no;
            return (
              <button
                key={no}
                type="button"
                className={"home-track" + (active ? " playing" : "")}
                onClick={() => onPlayTrack(no)}
              >
                <span className="home-track-no">{String(no).padStart(2, "0")}</span>
                <span className="home-track-title">{title}</span>
                <span className="home-track-dur">{fmt(ms)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
