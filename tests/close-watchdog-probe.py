"""Native blocked-worker regression, not a packaged Windows WebView/IPC test."""
from pathlib import Path
import os, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
env=dict(os.environ,CARGO_HOME=str(root/'.build-tools/cargo'),RUSTUP_HOME=str(root/'.build-tools/rustup'))
with tempfile.TemporaryDirectory(prefix='ytnh-close-probe-') as work:
 binary=str(Path(work)/'probe')
 subprocess.run([str(root/'.build-tools/cargo/bin/rustc'),'--edition=2021','--test',str(root/'src-tauri/src/close_probe.rs'),'-o',binary],env=env,check=True)
 subprocess.run([binary,'--nocapture'],check=True)
