import { fmtC } from "../util";
import type { Release, TocInfo } from "../api";

export function TrackPanel({
  disc,
  release,
  realMediaCount,
  mediumIdx,
  onPickMedium,
  playing,
  onPlay,
}: {
  disc: TocInfo;
  release: Release | null;
  realMediaCount: number;
  mediumIdx: number | null;
  onPickMedium: (i: number) => void;
  playing: { no: number; title: string } | null;
  onPlay: (no: number) => void;
}) {
  const metaTracks = release?.media?.[0]?.tracks ?? [];
  const artists = release?.artistCredit?.map((a) => a.name).join(" / ") || "";
  return (
    <aside className="track-panel">
      <div className="panel-title-row">
        <div className="panel-title">曲目列表</div>
        {realMediaCount > 1 && (
          <div className="disc-chips">
            {Array.from({ length: realMediaCount }, (_, i) => (
              <button
                key={i}
                className={"chip" + ((mediumIdx ?? 0) === i ? " on" : "")}
                onClick={() => onPickMedium(i)}
                title={`第 ${i + 1} 张碟片`}
              >
                {i === 0 ? "A 碟" : i === 1 ? "B 碟" : `${i + 1} 碟`}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="panel-tracklist">
        {disc.tracks.map((t, i) => {
          const mt = metaTracks[i];
          const title = mt?.title ?? `曲目 ${t.no}`;
          const isPlay = playing?.no === t.no;
          return (
            <div
              key={t.no}
              className={"panel-track" + (isPlay ? " playing" : "")}
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
      {release && <div className="panel-hint muted">{artists}</div>}
    </aside>
  );
}
