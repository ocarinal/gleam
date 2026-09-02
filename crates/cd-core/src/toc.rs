//! 光盘 TOC 读取 — 直接 ioctl, 与 libdiscid 调用序列一致
//! (CDROMREADTOCHDR 0x5305 / CDROMREADTOCENTRY 0x5306, lead-out 用轨道号 0xAA)

use super::discid::Toc;
use std::os::fd::AsRawFd;

#[cfg(target_os = "linux")]
mod linux {
    use super::Toc;
    use std::fs::File;
    use std::os::fd::AsRawFd;

    const CDROMREADTOCHDR: libc::c_ulong = 0x5305;
    const CDROMREADTOCENTRY: libc::c_ulong = 0x5306;
    const CDROM_LBA: u8 = 0x01;
    const CDROM_LEADOUT: u8 = 0xAA;

    // 与 /usr/include/linux/cdrom.h 布局一致
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct TocHdr {
        trk0: u8,
        trk1: u8,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct TocEntry {
        track: u8,
        ctrl_adr: u8,
        format: u8,
        _pad: u8,
        addr: i32,
        datamode: u8,
    }

    const _: () = {
        assert!(std::mem::size_of::<TocHdr>() == 2);
        assert!(std::mem::size_of::<TocEntry>() == 12);
    };

    fn err(msg: &str) -> String {
        format!("{msg}: {}", std::io::Error::last_os_error())
    }

    pub fn read_toc(device: &str) -> Result<Toc, String> {
        let f = File::open(device).map_err(|e| format!("打开 {device} 失败: {e}"))?;
        let fd = f.as_raw_fd();

        let mut hdr = TocHdr::default();
        if unsafe { libc::ioctl(fd, CDROMREADTOCHDR, &mut hdr) } < 0 {
            let e = std::io::Error::last_os_error();
            if e.raw_os_error() == Some(123) {
                // ENOMEDIUM
                return Err("光驱里没有光盘".into());
            }
            return Err(err("读取 TOC 头失败"));
        }
        if hdr.trk1 == 0 {
            return Err("这张盘没有音轨".into());
        }

        let mut tracks = Vec::new();
        for n in hdr.trk0..=hdr.trk1 {
            let mut e = TocEntry {
                track: n,
                format: CDROM_LBA,
                ..Default::default()
            };
            if unsafe { libc::ioctl(fd, CDROMREADTOCENTRY, &mut e) } < 0 {
                return Err(err(&format!("读取轨道 {n} 失败")));
            }
            tracks.push((e.addr as u32, (e.ctrl_adr >> 4) & 0x0F));
        }

        let mut e = TocEntry {
            track: CDROM_LEADOUT,
            format: CDROM_LBA,
            ..Default::default()
        };
        if unsafe { libc::ioctl(fd, CDROMREADTOCENTRY, &mut e) } < 0 {
            return Err(err("读取 lead-out 失败"));
        }

        Ok(Toc {
            first: hdr.trk0,
            last: hdr.trk1,
            tracks,
            leadout: e.addr as u32,
        })
    }
}

pub fn read_toc(device: &str) -> Result<Toc, String> {
    #[cfg(target_os = "linux")]
    {
        linux::read_toc(device)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = device;
        Err("当前仅支持 Linux (ioctl 实现)".into())
    }
}

/// 托盘开合状态: 读 /sys/class/cdrom/cdromN/tray_open (零设备命令)
/// 返回: Some(true)=托盘开着(无介质), Some(false)=托盘关闭, None=系统无此属性
pub fn tray_is_open() -> Option<bool> {
    let rd = std::fs::read_dir("/sys/class/cdrom").ok()?;
    for e in rd.flatten() {
        let p = e.path().join("tray_open");
        if let Ok(v) = std::fs::read_to_string(&p) {
            return Some(v.trim() == "1");
        }
    }
    None
}

/// 弹出托盘 (CDROMEJECT 0x5309): 解锁舱门 + 三次重试
/// 注意: 弹出后请勿对设备发任何命令 (部分 USB 桥接固件收到命令会自动合拢托盘)
pub fn eject(device: &str) -> Result<(), String> {
    // 设备可能在重新枚举(USB 桥接闪断), 打开带重试
    let mut f = None;
    let mut last = String::new();
    for _ in 0..5 {
        match std::fs::File::open(device) {
            Ok(fd) => {
                f = Some(fd);
                break;
            }
            Err(e) => {
                last = e.to_string();
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
        }
    }
    let f = f.ok_or(format!("打开 {device} 失败: {last} — 设备是否掉线? 检查 USB 线/接口"))?;
    let fd = f.as_raw_fd();
    let mut last_err = String::new();
    for attempt in 0..3 {
        unsafe {
            libc::ioctl(fd, 0x5329, 0); // CDROM_LOCKDOOR: 解锁
        }
        if unsafe { libc::ioctl(fd, 0x5309) } == 0 {
            return Ok(());
        }
        last_err = std::io::Error::last_os_error().to_string();
        if attempt < 2 {
            std::thread::sleep(std::time::Duration::from_millis(400));
        }
    }
    Err(format!("弹出失败: {last_err}"))
}

/// 光驱托盘/介质状态 (CDROM_DRIVE_STATUS 0x5326)
/// 返回: "disc" | "empty" | "unknown"
pub fn drive_status(device: &str) -> Result<String, String> {
    let f = std::fs::File::open(device).map_err(|e| format!("打开 {device} 失败: {e}"))?;
    let fd = f.as_raw_fd();
    let st = unsafe { libc::ioctl(fd, 0x5326) };
    if st < 0 {
        return Ok("unknown".into());
    }
    Ok(match st {
        4 => "disc".into(),        // CDS_DISC_OK
        1 | 2 => "empty".into(),   // CDS_NO_DISC / CDS_TRAY_OPEN
        _ => "unknown".into(),
    })
}

/// 自动探测光驱: /proc/sys/dev/cdrom/info (与 libdiscid 相同来源)
pub fn auto_device() -> Result<String, String> {
    if std::path::Path::new("/dev/cdrom").exists() {
        return Ok("/dev/cdrom".into());
    }
    let info = std::fs::read_to_string("/proc/sys/dev/cdrom/info")
        .map_err(|_| "未发现光驱".to_string())?;
    for line in info.lines() {
        if line.starts_with("drive name:") {
            if let Some(name) = line.split('\t').last() {
                let name = name.trim();
                if !name.is_empty() {
                    return Ok(format!("/dev/{name}"));
                }
            }
        }
    }
    Err("未发现光驱".into())
}
