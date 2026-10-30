use std::io;
use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::OnceLock;

/// 优先 IPv4, 避免在没有 IPv6 路由的网络上卡住 30 秒。
fn resolve_ipv4(netloc: &str) -> io::Result<Vec<SocketAddr>> {
    let all: Vec<SocketAddr> = netloc.to_socket_addrs()?.collect();
    let v4: Vec<SocketAddr> = all.iter().copied().filter(|a| a.is_ipv4()).collect();
    if v4.is_empty() {
        Ok(all)
    } else {
        Ok(v4)
    }
}

fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::AgentBuilder::new()
            .resolver(resolve_ipv4)
            .build()
    })
}

pub fn get(url: &str) -> ureq::Request {
    agent().get(url)
}
