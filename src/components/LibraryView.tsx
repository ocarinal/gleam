import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  libraryCover,
  libraryRemove,
  librarySetGroup,
  libraryUpdate,
  listLibrary,
  refreshCover,
  saveCover,
  type LibraryEntry,
  type Release,
} from "../api";

type SortMode = "manual" | "artist" | "date";

type Unit = {
  key: string;
  group: string | null;
  lead: LibraryEntry;
  members: LibraryEntry[];
  labels: string[];
};

const readOrder = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem("sd-library-order") ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const readSort = (): SortMode => {
  const v = localStorage.getItem("sd-library-sort");
  return v === "artist" || v === "date" || v === "manual" ? v : "manual";
};
const artistOf = (e: LibraryEntry) =>
  e.release.artistCredit?.map((a) => a.name).join(" / ") || "";
const dateOf = (e: LibraryEntry) => e.release.date || "";
const labelRank = (l: string | null) => (l ? l.charCodeAt(0) : 999);
const nextLabel = (u: Unit) => {
  const used = new Set(u.members.map((m) => m.discLabel).filter(Boolean));
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!used.has(l)) return l;
  }
  return "Z";
};

function unitize(entries: LibraryEntry[]): Unit[] {
  const seen = new Set<string>();
  const out: Unit[] = [];
  for (const e of entries) {
    if (!e.group) {
      out.push({
        key: e.discId,
        group: null,
        lead: e,
        members: [e],
        labels: [],
      });
      continue;
    }
    if (seen.has(e.group)) continue;
    seen.add(e.group);
    const members = entries
      .filter((x) => x.group === e.group)
      .sort((a, b) => labelRank(a.discLabel) - labelRank(b.discLabel));
    if (members.length === 0) continue;
    const lead =
      members.find((m) => m.discLabel === "A") ?? members[0];
    out.push({
      key: lead.discId,
      group: e.group,
      lead,
      members,
      labels: members.map((m) => m.discLabel ?? "?"),
    });
  }
  return out;
}

/* ---------------- 右键菜单: 视口内定位 ---------------- */
function CtxMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { label: string; danger?: boolean; on?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 10;
    setPos({
      x: Math.max(pad, Math.min(x, window.innerWidth - r.width - pad)),
      y: Math.max(pad, Math.min(y, window.innerHeight - r.height - pad)),
    });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div
          key={i}
          className={"ctx-item" + (it.danger ? " danger" : "") + (it.on ? " checked" : "")}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.label}
        </div>
      ))}
    </div>,
    document.body
  );
}

/* ---------------- 碟组弹窗 ---------------- */
function DiscThumb({ e }: { e: LibraryEntry }) {
  const [cover, setCover] = useState<string | null>(null);
  const artist = artistOf(e);
  const title = e.release.title || e.release.media?.[0]?.tracks?.[0]?.title || "";
  useEffect(() => {
    let alive = true;
    void libraryCover(e.release.id ?? "", title, artist)
      .then((c) => alive && setCover(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [e.discId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="disc-thumb">
      {cover ? <img src={cover} alt="" /> : <span>♫</span>}
    </div>
  );
}

function GroupModal({
  unit,
  onClose,
  onOpenRelease,
}: {
  unit: Unit;
  onClose: () => void;
  onOpenRelease: (id: string) => void;
}) {
  const [hero, setHero] = useState<string | null>(null);
  const lead = unit.lead;
  const artist = artistOf(lead);
  const title =
    lead.release.title || lead.release.media?.[0]?.tracks?.[0]?.title || "未命名专辑";

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    void libraryCover(lead.release.id ?? "", title, artist)
      .then((c) => alive && setHero(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lead.discId]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div
      className="group-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="group-modal">
        <div className="group-hero">
          {hero && (
            <div
              className="group-hero-bg"
              style={{ backgroundImage: `url(${hero})` }}
            />
          )}
          <div className="group-hero-shade" />
          <div className="group-hero-cover">
            {hero ? <img src={hero} alt="" /> : <span>♫</span>}
          </div>
          <div className="group-hero-meta">
            <div className="group-kicker">
              光盘合集 · {unit.members.length} 张碟
            </div>
            <div className="group-title">{title}</div>
            <div className="group-artist">
              {artist || "未知艺人"}
              {lead.release.date ? <span> · {lead.release.date}</span> : null}
            </div>
            <div className="group-label-row">
              {unit.members.map((m) => (
                <span className="group-pill" key={m.discId}>
                  {m.discLabel ?? "?"}
                </span>
              ))}
            </div>
          </div>
          <button className="group-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="group-list-head">
          <span>收录碟片</span>
          <span>{unit.members.length} 张</span>
        </div>

        <div className="group-list">
          {unit.members.map((m) => (
            <button
              type="button"
              className="group-row"
              key={m.discId}
              onClick={() => m.release.id && onOpenRelease(m.release.id)}
              title="在 MusicBrainz 打开"
            >
              <span className="group-label">{m.discLabel ?? "?"}</span>
              <DiscThumb e={m} />
              <span className="group-row-meta">
                <span className="group-row-title">{m.release.title}</span>
                <span className="group-row-sub">
                  {[m.release.date, m.release.country].filter(Boolean).join(" · ")}
                  {" · "}
                  <span className="group-discid">{m.discId}</span>
                </span>
              </span>
              <span className="group-open">打开 ↗</span>
            </button>
          ))}
        </div>

        <div className="group-foot">
          合集在光盘库中只显示一张封面；右键卡片可继续增加 C、D 碟。
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------------- 光盘卡片 ---------------- */
function LibCard({
  e,
  index,
  editing,
  groupLabels,
  selecting,
  selectDisabled,
  draggable,
  dragging,
  dragOver,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onActivate,
  onContext,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  e: LibraryEntry;
  index: number;
  editing: boolean;
  groupLabels: string[];
  selecting: boolean;
  selectDisabled: boolean;
  draggable: boolean;
  dragging: boolean;
  dragOver: boolean;
  onStartEdit: () => void;
  onSaveEdit: (title: string, artist: string) => void;
  onCancelEdit: () => void;
  onActivate: () => void;
  onContext: (ev: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [cover, setCover] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [t, setT] = useState("");
  const [a, setA] = useState("");
  const suppressClick = useRef(false);
  const r: Release | undefined = e.release;
  const artist = r?.artistCredit?.map((x) => x.name).join(" / ") || "";
  const first = r?.title ?? r?.media?.[0]?.tracks?.[0]?.title ?? "";
  const isGroup = groupLabels.length > 0;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void libraryCover(r?.id ?? "", first, artist)
      .then((c) => {
        if (alive) {
          setCover(c);
          setLoading(false);
        }
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [e.discId, r?.id, artist]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) {
      setT(r?.title ?? "");
      setA(artist);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={
        "lib-card" +
        (dragging ? " dragging" : "") +
        (dragOver ? " drag-over" : "") +
        (selecting ? " selecting-card" : "") +
        (selectDisabled ? " select-disabled" : "")
      }
      style={{ animationDelay: `${Math.min(index, 12) * 70}ms` }}
      draggable={draggable && !editing && !selecting}
      onDragStart={(ev) => {
        suppressClick.current = true;
        onDragStart(ev);
      }}
      onDragOver={onDragOver}
      onDrop={(ev) => {
        onDrop(ev);
        window.setTimeout(() => (suppressClick.current = false), 200);
      }}
      onDragEnd={() => {
        onDragEnd();
        window.setTimeout(() => (suppressClick.current = false), 200);
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (selecting && selectDisabled) return;
        onActivate();
      }}
      onContextMenu={(ev) => {
        ev.preventDefault();
        if (!selecting) onContext(ev);
      }}
      title={
        isGroup
          ? `点击查看 ${groupLabels.join("/")} 碟 · 右键编辑`
          : "右键编辑 · 点击在 MusicBrainz 打开"
      }
    >
      <div className="lib-cover-wrap">
        {cover && <div className="lib-disc-ghost" />}
        <div className={"lib-cover" + (!cover && loading ? " loading" : "")}>
          {cover ? (
            <img src={cover} alt="" />
          ) : (
            <span className="lib-cover-empty">♫</span>
          )}
        </div>
        <button className="lib-play-hint" tabIndex={-1}>
          ▶
        </button>
      </div>

      {editing ? (
        <div className="lib-edit">
          <input
            className="set-input"
            placeholder="专辑名"
            value={t}
            onChange={(ev) => setT(ev.target.value)}
          />
          <input
            className="set-input"
            placeholder="艺术家"
            value={a}
            onChange={(ev) => setA(ev.target.value)}
          />
          <div className="lib-edit-btns">
            <button className="btn" onClick={() => onSaveEdit(t, a)}>
              保存
            </button>
            <button className="btn btn-ghost" onClick={onCancelEdit}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="lib-title" title={r?.title}>
            {r?.title ?? "未知专辑"}
            {isGroup && (
              <span className="lib-badge lib-collection">{groupLabels.join(" / ")}</span>
            )}
            {(r?.media?.length ?? 0) > 1 && !isGroup && (
              <span className="lib-badge">
                {e.medium !== undefined && e.medium !== null
                  ? ["双碟 · A 碟", "双碟 · B 碟"][Math.min(Number(e.medium ?? 0), 1)] ?? "双碟"
                  : "双碟"}
              </span>
            )}
          </div>
          <div className="lib-artist">{artist}</div>
          <div className="lib-meta">
            {isGroup ? `${groupLabels.length} 碟 · ` : ""}
            {[r?.date, r?.country].filter(Boolean).join(" · ")}
            {r?.disambiguation ? ` · ${r.disambiguation}` : ""}
          </div>
          <div className="lib-discid">{e.discId}</div>
        </>
      )}
    </div>
  );
}

/* ---------------- 光盘库 ---------------- */
export function LibraryView({
  onOpenRelease,
}: {
  onOpenRelease: (id: string) => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>(readSort);
  const [order, setOrder] = useState<string[]>(readOrder);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [selecting, setSelecting] = useState<{ group: string; label: string } | null>(null);
  const [prompt, setPrompt] = useState<{ group: string; label: string; title: string } | null>(null);
  const [openGroup, setOpenGroup] = useState<Unit | null>(null);
  const [flash, setFlash] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const fileDiscRef = useRef<string>("");

  const load = async () => {
    try {
      const list = await listLibrary();
      setEntries(list);
      return list;
    } catch {
      setEntries([]);
      return [] as LibraryEntry[];
    }
  };

  useEffect(() => {
    void load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem("sd-library-order", JSON.stringify(order));
  }, [order]);
  useEffect(() => {
    localStorage.setItem("sd-library-sort", sortMode);
  }, [sortMode]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    if (!selecting && !prompt) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelecting(null);
        setPrompt(null);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [selecting, prompt]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const units = useMemo(() => unitize(entries ?? []), [entries]);
  const shown = useMemo(() => {
    if (sortMode === "artist") {
      return [...units].sort((a, b) => {
        const aa = artistOf(a.lead);
        const bb = artistOf(b.lead);
        const c = aa.localeCompare(bb, "zh-Hans-CN");
        return c !== 0
          ? c
          : (a.lead.release.title || "").localeCompare(
              b.lead.release.title || "",
              "zh-Hans-CN"
            );
      });
    }
    if (sortMode === "date") {
      return [...units].sort((a, b) => {
        const c = dateOf(b.lead).localeCompare(dateOf(a.lead));
        return c !== 0
          ? c
          : artistOf(a.lead).localeCompare(artistOf(b.lead), "zh-Hans-CN");
      });
    }
    const byKey = new Map(units.map((u) => [u.key, u]));
    const ids = order.length ? order : units.map((u) => u.key);
    const ordered = ids
      .map((id) => byKey.get(id))
      .filter((u): u is Unit => Boolean(u));
    const known = new Set(ids);
    const extra = units.filter((u) => !known.has(u.key));
    return [...ordered, ...extra];
  }, [units, sortMode, order]);

  const menuUnit = menu ? shown.find((u) => u.key === menu.key) : null;

  const moveUnit = (from: number, to: number) => {
    if (from === to) return;
    const ids = shown.map((u) => u.key);
    if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setOrder(ids);
    setSortMode("manual");
  };

  const startAB = async (unit: Unit) => {
    setMenu(null);
    const group = `grp-${unit.lead.discId}`;
    try {
      await librarySetGroup(unit.lead.discId, group, "A");
      await load();
      setPrompt({ group, label: "B", title: unit.lead.release.title || "这张专辑" });
    } catch {
      setFlash("设置 A 碟失败");
    }
  };

  const beginSelect = (group: string, label: string) => {
    setPrompt(null);
    setMenu(null);
    setSelecting({ group, label });
  };

  const selectTarget = async (unit: Unit) => {
    if (!selecting || unit.group) {
      if (selecting && unit.group) setFlash("这张封面已在碟组中，请选择未编组的封面");
      return;
    }
    const { group, label } = selecting;
    try {
      await librarySetGroup(unit.lead.discId, group, label);
      await load();
      setSelecting(null);
      setFlash(`已将「${unit.lead.release.title}」设为 ${label} 碟`);
    } catch {
      setFlash(`设置 ${label} 碟失败`);
    }
  };

  const removeUnit = async (unit: Unit) => {
    try {
      if (unit.group) {
        await Promise.all(unit.members.map((m) => libraryRemove(m.discId)));
      } else {
        await libraryRemove(unit.lead.discId);
      }
      await load();
      setFlash(unit.group ? "已移除整个碟组" : "已从光盘库移除");
    } catch {
      setFlash("移除失败");
    }
  };

  return (
    <div className={"library" + (selecting ? " selecting" : "")}>
      <div className="library-head">
        <div>
          <div className="library-title">本地光盘库</div>
          <div className="library-sub">
            {shown.length} 张收藏 · 右键卡片编辑
            {sortMode === "manual" ? " · 拖动卡片排序" : ""}
          </div>
        </div>
        <div className="lib-sort">
          <span>排序</span>
          <button
            className={"lib-sort-btn" + (sortMode === "manual" ? " on" : "")}
            onClick={() => setSortMode("manual")}
          >
            手动
          </button>
          <button
            className={"lib-sort-btn" + (sortMode === "artist" ? " on" : "")}
            onClick={() => setSortMode("artist")}
          >
            歌手
          </button>
          <button
            className={"lib-sort-btn" + (sortMode === "date" ? " on" : "")}
            onClick={() => setSortMode("date")}
          >
            发行时间
          </button>
        </div>
      </div>

      {shown.length === 0 && (
        <div className="center-hint">插入光盘并识别成功后会自动收录</div>
      )}

      <div className="lib-grid">
        {shown.map((u, i) => (
          <LibCard
            key={u.key + refreshKey}
            e={u.lead}
            index={i}
            editing={editingId === u.lead.discId}
            groupLabels={u.labels}
            selecting={Boolean(selecting)}
            selectDisabled={Boolean(selecting && u.group)}
            draggable={!selecting}
            dragging={dragFrom === i}
            dragOver={dragOver === i && dragFrom !== i}
            onStartEdit={() => setEditingId(u.lead.discId)}
            onSaveEdit={(tt, aa) => {
              void libraryUpdate(u.lead.discId, tt, aa).then(() => {
                setEditingId(null);
                refresh();
              });
            }}
            onCancelEdit={() => setEditingId(null)}
            onActivate={() => {
              if (selecting) {
                void selectTarget(u);
              } else if (u.group) {
                setOpenGroup(u);
              } else if (u.lead.release.id) {
                onOpenRelease(u.lead.release.id);
              }
            }}
            onContext={(ev) =>
              setMenu({ x: ev.clientX, y: ev.clientY, key: u.key })
            }
            onDragStart={(ev) => {
              setDragFrom(i);
              ev.dataTransfer.effectAllowed = "move";
              ev.dataTransfer.setData("text/plain", String(i));
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = "move";
              if (dragOver !== i) setDragOver(i);
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              const from =
                dragFrom !== null
                  ? dragFrom
                  : Number(ev.dataTransfer.getData("text/plain"));
              if (Number.isFinite(from)) moveUnit(from, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
          />
        ))}
      </div>

      {menu && menuUnit && (
        <CtxMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "✏️ 编辑元数据",
              onClick: () => setEditingId(menuUnit.lead.discId),
            },
            ...(menuUnit.group
              ? [
                  {
                    label:
                      nextLabel(menuUnit) === "B"
                        ? "💿 设置 B 碟"
                        : `💿 增加 ${nextLabel(menuUnit)} 碟`,
                    onClick: () =>
                      beginSelect(menuUnit.group!, nextLabel(menuUnit)),
                  },
                  {
                    label: `👁 查看 ${menuUnit.labels.join(" / ")} 碟`,
                    onClick: () => setOpenGroup(menuUnit),
                  },
                ]
              : [
                  {
                    label: "💿 设置 AB 碟",
                    onClick: () => void startAB(menuUnit),
                  },
                ]),
            {
              label: "⟳ 刷新封面",
              onClick: () => {
                const r = menuUnit.lead.release;
                if (!r?.id) return;
                void refreshCover(
                  r.id,
                  r.releaseGroup?.id ?? null,
                  r.title ?? r.media?.[0]?.tracks?.[0]?.title ?? "",
                  r.artistCredit?.map((a) => a.name).join(" / ") ?? ""
                ).then(refresh);
              },
            },
            {
              label: "🖼 上传封面",
              onClick: () => {
                fileDiscRef.current = menuUnit.lead.release?.id ?? "";
                fileRef.current?.click();
              },
            },
            {
              label: "⤴ 打开 MusicBrainz",
              onClick: () => {
                if (menuUnit.lead.release?.id) onOpenRelease(menuUnit.lead.release.id);
              },
            },
            {
              label: menuUnit.group ? "🗑 移除整组" : "🗑 从光盘库移除",
              danger: true,
              onClick: () => void removeUnit(menuUnit),
            },
          ]}
        />
      )}

      {selecting &&
        createPortal(
          <div className="group-select-banner">
            <span className="group-banner-dot" />
            <span>
              请单击另一张封面设为 <b>{selecting.label} 碟</b>
            </span>
            <span className="group-banner-hint">
              仅可选择未编组的封面
            </span>
            <button onClick={() => setSelecting(null)}>取消</button>
          </div>,
          document.body
        )}

      {prompt &&
        createPortal(
          <div
            className="group-prompt-overlay"
            onMouseDown={(e) => e.target === e.currentTarget && setPrompt(null)}
          >
            <div className="group-prompt">
              <div className="group-prompt-kicker">设置 AB 碟</div>
              <div className="group-prompt-title">{prompt.title}</div>
              <div className="group-prompt-text">
                已将这张设为 <b>A 碟</b>。请再选择 B 碟，也可以以后再设置。
              </div>
              <div className="group-prompt-actions">
                <button
                  className="btn"
                  onClick={() => beginSelect(prompt.group, prompt.label)}
                >
                  设置 B 碟
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setPrompt(null)}
                >
                  以后再设置
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {openGroup && (
        <GroupModal
          unit={openGroup}
          onClose={() => setOpenGroup(null)}
          onOpenRelease={onOpenRelease}
        />
      )}

      {flash &&
        createPortal(
          <div className="library-flash">{flash}</div>,
          document.body
        )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = () => {
            const rid = fileDiscRef.current;
            if (!rid) return;
            void saveCover(rid, String(rd.result)).then(() => refresh());
          };
          rd.readAsDataURL(f);
          ev.target.value = "";
        }}
      />
    </div>
  );
}
