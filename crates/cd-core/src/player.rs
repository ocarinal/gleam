//! mpv 内嵌播放器: 进程内 libmpv (FFI), 无外部进程/无窗口
//! 播放/暂停/seek/音量/进度事件全部在本进程内完成

use libloading::Library;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int, c_void};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, OnceLock};

// mpv client.h 事件/格式常量
const EV_END_FILE: c_int = 7;
const EV_PROPERTY_CHANGE: c_int = 22;
const FORMAT_FLAG: c_int = 3;
const FORMAT_DOUBLE: c_int = 5;
const END_FILE_REASON_EOF: c_int = 0;

#[repr(C)]
struct MEvent {
    event_id: c_int,
    error: c_int,
    reply_userdata: u64,
    data: *mut c_void,
}

#[repr(C)]
struct MEventProperty {
    name: *const c_char,
    format: c_int,
    data: *mut c_void,
}

#[repr(C)]
struct MEventEndFile {
    reason: c_int,
    error: c_int,
    playlist_entry_id: u64,
    playlist_insert_id: u64,
    playlist_insert_pos: i64,
}

#[derive(Clone, Copy)]
struct MpvHandle(usize); // libmpv 句柄 (usize 保证跨线程)
unsafe impl Send for MpvHandle {}
unsafe impl Sync for MpvHandle {}

type FnCreate = unsafe extern "C" fn() -> *mut c_void;
type FnInit = unsafe extern "C" fn(*mut c_void) -> c_int;
type FnSetOption = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type FnSetProperty = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type FnCommand = unsafe extern "C" fn(*mut c_void, *const *const c_char) -> c_int;
type FnObserve = unsafe extern "C" fn(*mut c_void, u64, *const c_char, c_int) -> c_int;
type FnWaitEvent = unsafe extern "C" fn(*mut c_void, c_double) -> *mut MEvent;
type FnErrorString = unsafe extern "C" fn(c_int) -> *const c_char;
type FnTerminateDep = unsafe extern "C" fn(*mut c_void);

struct Fns {
    create: FnCreate,
    init: FnInit,
    set_option: FnSetOption,
    set_property: FnSetProperty,
    command: FnCommand,
    observe: FnObserve,
    wait_event: FnWaitEvent,
    error_string: FnErrorString,
    terminate_destroy: FnTerminateDep,
}

static LIB: OnceLock<&'static Library> = OnceLock::new();
static FNS: OnceLock<Fns> = OnceLock::new();

fn fns() -> Result<&'static Fns, String> {
    // libmpv 硬性要求: LC_NUMERIC 必须为 "C" (中文 locale 下 mpv_create 会返回 NULL)
    unsafe {
        libc::setlocale(libc::LC_NUMERIC, b"C\0".as_ptr() as *const c_char);
    }
    if let Some(f) = FNS.get() {
        return Ok(f);
    }
    let lib: &'static Library = LIB.get_or_init(|| {
        // 泄漏加载的库 (进程生命周期), 保证符号引用有效
        let l = unsafe { libloading::Library::new("libmpv.so.2") }
            .or_else(|_| unsafe { libloading::Library::new("libmpv.so.1") })
            .expect("无法加载 libmpv.so.2 (安装 mpv 包即可)");
        Box::leak(Box::new(l))
    });

    unsafe fn sym<T: Copy>(lib: &Library, name: &[u8]) -> Result<T, String> {
        lib.get::<T>(name)
            .map(|s| *s)
            .map_err(|e| format!("缺少符号 {:?}: {e}", String::from_utf8_lossy(&name[..name.len() - 1])))
    }

    let fs = Fns {
        create: unsafe { sym::<FnCreate>(lib, b"mpv_create\0")? },
        init: unsafe { sym::<FnInit>(lib, b"mpv_initialize\0")? },
        set_option: unsafe { sym::<FnSetOption>(lib, b"mpv_set_option_string\0")? },
        set_property: unsafe { sym::<FnSetProperty>(lib, b"mpv_set_property_string\0")? },
        command: unsafe { sym::<FnCommand>(lib, b"mpv_command\0")? },
        observe: unsafe { sym::<FnObserve>(lib, b"mpv_observe_property\0")? },
        wait_event: unsafe { sym::<FnWaitEvent>(lib, b"mpv_wait_event\0")? },
        error_string: unsafe { sym::<FnErrorString>(lib, b"mpv_error_string\0")? },
        terminate_destroy: unsafe { sym::<FnTerminateDep>(lib, b"mpv_terminate_destroy\0")? },
    };
    let _ = FNS.set(fs);
    Ok(FNS.get().unwrap())
}

fn cerr(s: &[u8]) -> CString {
    let s = s.strip_suffix(b"\0").unwrap_or(s);
    CString::new(s).expect("字符串含 NUL")
}

pub struct Player {
    handle: *mut c_void,
    pump_stop: Arc<AtomicBool>,
    _guard: &'static Library,
}

// libmpv 句柄在我们的线程模型下是 Send 安全的 (无回调逃逸)
unsafe impl Send for Player {}

impl Player {
    /// 直接以指定轨道启动 (进程内 libmpv)
    pub fn spawn_track(
        device: &str,
        track_no: u8,
        _log_dir: &std::path::Path,
        evt_tx: Sender<serde_json::Value>,
    ) -> Result<Player, String> {
        let f = fns()?;
        let handle = unsafe { (f.create)() };
        if handle.is_null() {
            return Err("libmpv 创建失败".into());
        }
        // 初始化步骤包进闭包, 任何失败都统一销毁句柄 (避免泄漏)
        let init = || -> Result<(), String> {
            let opt = |name: &str, val: &str| -> Result<(), String> {
                let r = unsafe { (f.set_option)(handle, cerr(name.as_bytes()).as_ptr(), cerr(val.as_bytes()).as_ptr()) };
                if r < 0 {
                    return Err(format!("mpv option {name}: {}", unsafe { CStr::from_ptr((f.error_string)(r)) }.to_string_lossy()));
                }
                Ok(())
            };
            opt("video", "no")?;
            opt("force-window", "no")?;
            opt("cdda-device", device)?;
            opt("start", &format!("#{track_no}"))?;
            if let Ok(ao) = std::env::var("SOUNDDISC_MPV_AO") {
                let _ = opt("ao", &ao);
            }
            let rc = unsafe { (f.init)(handle) };
            if rc < 0 {
                return Err(format!("mpv 初始化失败: {}", unsafe { CStr::from_ptr((f.error_string)(rc)) }.to_string_lossy()));
            }
            // 观察进度属性 (起播前挂上, 事件不漏)
            for (id, name, fmt) in [
                (1u64, "time-pos\0", FORMAT_DOUBLE),
                (2u64, "duration\0", FORMAT_DOUBLE),
                (3u64, "pause\0", FORMAT_FLAG), // pause 是布尔属性, 必须用 FLAG 否则收不到事件
            ] {
                let r = unsafe { (f.observe)(handle, id, cerr(name.as_bytes()).as_ptr(), fmt) };
                if r < 0 {
                    return Err(format!("observe {name} 失败: {}", unsafe { CStr::from_ptr((f.error_string)(r)) }.to_string_lossy()));
                }
            }
            let a = cerr(b"loadfile\0".as_slice());
            let b = cerr(b"cdda://\0".as_slice());
            let cmd = [a.as_ptr(), b.as_ptr(), std::ptr::null::<c_char>()];
            let rc = unsafe { (f.command)(handle, cmd.as_ptr()) };
            if rc < 0 {
                return Err(format!("mpv 加载失败: {}", unsafe { CStr::from_ptr((f.error_string)(rc)) }.to_string_lossy()));
            }
            Ok(())
        };
        if let Err(e) = init() {
            unsafe { (fns().unwrap().terminate_destroy)(handle) };
            return Err(e);
        }

        let pump_stop = Arc::new(AtomicBool::new(false));
        let stop2 = pump_stop.clone();
        let tx2 = evt_tx.clone();
        let h = MpvHandle(handle as usize);
        std::thread::spawn(move || {
            let handle = h.0 as *mut c_void;
            loop {
                if stop2.load(Ordering::Relaxed) {
                    break;
                }
                let ev = unsafe { (f.wait_event)(handle, 0.15) };
                if ev.is_null() {
                    continue;
                }
                let ev = unsafe { &*ev };
                match ev.event_id {
                    EV_PROPERTY_CHANGE => {
                        let p = unsafe { &*(ev.data as *const MEventProperty) };
                        let name = unsafe { CStr::from_ptr(p.name) }.to_string_lossy().into_owned();
                        let num = match p.format {
                            FORMAT_DOUBLE => unsafe { *(p.data as *const c_double) },
                            FORMAT_FLAG => {
                                unsafe {
                                    if *(p.data as *const c_int) != 0 {
                                        1.0
                                    } else {
                                        0.0
                                    }
                                }
                            }
                            _ => 0.0,
                        };
                        let v = if name == "pause" {
                            serde_json::json!(num != 0.0)
                        } else {
                            serde_json::json!(num)
                        };
                        let _ = tx2.send(serde_json::json!({ "name": name, "data": v }));
                    }
                    EV_END_FILE => {
                        let e = unsafe { &*(ev.data as *const MEventEndFile) };
                        if e.reason == END_FILE_REASON_EOF {
                            let _ = tx2.send(serde_json::json!({ "event": "ended" }));
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(Player {
            handle,
            pump_stop,
            _guard: LIB.get().unwrap(),
        })
    }

    pub fn start_observe(&self) -> Result<(), String> {
        Ok(()) // 已在起播前挂好观察
    }

    pub fn chapters(&self) -> Result<Vec<serde_json::Value>, String> {
        Ok(Vec::new()) // 使用应用自己的 TOC 时长定位 (后端兜底)
    }

    pub fn pause(&self, paused: bool) -> Result<(), String> {
        let f = fns()?;
        let r = unsafe {
            (f.set_property)(
                self.handle,
                cerr(b"pause\0".as_slice()).as_ptr(),
                cerr(if paused { b"yes\0".as_slice() } else { b"no\0".as_slice() }).as_ptr(),
            )
        };
        if r < 0 {
            return Err(mpv_err(f, r));
        }
        Ok(())
    }

    pub fn seek(&self, secs: f64) -> Result<(), String> {
        let f = fns()?;
        let c0 = cerr(b"seek\0".as_slice());
        let s = format!("{secs}");
        let c1 = cerr(s.as_bytes());
        let c2 = cerr(b"absolute\0".as_slice());
        let cmd = [c0.as_ptr(), c1.as_ptr(), c2.as_ptr(), std::ptr::null::<c_char>()];
        let r = unsafe { (f.command)(self.handle, cmd.as_ptr()) };
        if r < 0 {
            return Err(mpv_err(f, r));
        }
        Ok(())
    }

    pub fn set_volume(&self, vol: u8) -> Result<(), String> {
        let f = fns()?;
        let v = format!("{}", vol.min(100));
        let r = unsafe {
            (f.set_property)(self.handle, cerr(b"volume\0".as_slice()).as_ptr(), cerr(v.as_bytes()).as_ptr())
        };
        if r < 0 {
            return Err(mpv_err(f, r));
        }
        Ok(())
    }

    pub fn stop(&mut self) {
        self.pump_stop.store(true, Ordering::Relaxed);
        unsafe { (fns().unwrap().terminate_destroy)(self.handle) };
        self.handle = std::ptr::null_mut();
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            self.pump_stop.store(true, Ordering::Relaxed);
            unsafe { (fns().unwrap().terminate_destroy)(self.handle) };
        }
    }
}

fn mpv_err(f: &Fns, r: c_int) -> String {
    unsafe { CStr::from_ptr((f.error_string)(r)) }.to_string_lossy().into_owned()
}
