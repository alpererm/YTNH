//! External image import. Only HTTPS requests to public IPv4 destinations are
//! permitted. Pin the resolved address on every hop, including redirects.
use std::{
    io::Read,
    net::{Ipv4Addr, ToSocketAddrs},
    time::Duration,
};
use url::Url;
use yutanohe_library::Result;

fn public_ip(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !matches!(a, 0 | 10 | 127 | 224..=255)
        && !(a == 100 && (64..128).contains(&b))
        && !(a == 169 && b == 254)
        && !(a == 172 && (16..32).contains(&b))
        && !(a == 192 && (b == 168 || b == 0 || (b == 88 && c == 99)))
        && !(a == 198 && (matches!(b, 18 | 19) || (b == 51 && c == 100)))
        && !(a == 203 && b == 0 && c == 113)
}
const MAX_DOWNLOAD: u64 = 256 * 1024 * 1024;
pub fn download(raw: &str) -> Result<(String, Vec<u8>)> {
    let mut url = Url::parse(raw)?;
    for _ in 0..6 {
        if url.scheme() != "https"
            || url.port_or_known_default() != Some(443)
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Use a public HTTPS image URL".into());
        }
        let host = url.host_str().ok_or("Image address has no hostname")?;
        let addrs: Vec<_> = (host, 443)
            .to_socket_addrs()?
            .filter(|addr| matches!(addr.ip(),std::net::IpAddr::V4(ip) if public_ip(ip)))
            .collect();
        if addrs.is_empty() {
            return Err("The image does not have a public network address".into());
        }
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .resolve_to_addrs(host, &addrs)
            .build()?;
        let response = client.get(url.clone()).send()?;
        if response.status().is_redirection() {
            url = url.join(
                response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .ok_or("Missing image redirect")?
                    .to_str()?,
            )?;
            continue;
        }
        let response = response.error_for_status()?;
        if response.content_length().is_some_and(|n| n > MAX_DOWNLOAD) {
            return Err(
                "Remote image exceeds 256 MB. Download it and insert the local file.".into(),
            );
        }
        let mut bytes = Vec::new();
        response.take(MAX_DOWNLOAD + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_DOWNLOAD {
            return Err("Image download exceeds 256 MB".into());
        }
        let name = url
            .path_segments()
            .and_then(|mut i| i.next_back())
            .filter(|s| !s.is_empty())
            .unwrap_or("Image")
            .to_owned();
        return Ok((name, bytes));
    }
    Err("Too many image redirects".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn network_scope() {
        for addr in [
            "127.0.0.1",
            "10.1.1.1",
            "169.254.169.254",
            "100.64.1.1",
            "192.168.0.1",
            "224.0.0.1",
        ] {
            assert!(!public_ip(addr.parse().unwrap()));
        }
        assert!(public_ip("8.8.8.8".parse().unwrap()));
        for url in [
            "file:///etc/hosts",
            "http://example.com/image",
            "https://127.0.0.1/a",
            "https://user@example.com/a",
        ] {
            assert!(download(url).is_err());
        }
    }
}
