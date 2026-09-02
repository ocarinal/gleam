//! libmpv 内嵌播放器探针: 验证 FFI 加载 + 错误路径
fn main() {
    let (tx, _rx) = std::sync::mpsc::channel();
    match cd_core::player::Player::spawn_track(
        "/dev/nonexistent",
        8,
        std::path::Path::new("/tmp"),
        tx,
    ) {
        Ok(p) => {
            println!("libmpv 加载并初始化成功 (设备错误属预期)");
            let mut p = p;
            p.stop();
        }
        Err(e) => println!("启动失败(预期, 无设备): {e}"),
    }
}
