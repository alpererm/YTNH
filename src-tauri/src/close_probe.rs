use std::time::{Duration, Instant};

// No automatic force-close: only another user close request can offer it.
#[derive(Default)]
pub struct CloseAttempt {
    started: Option<Instant>,
    acknowledged: bool,
    prompt_open: bool,
}
impl CloseAttempt {
    pub fn request(&mut self, now: Instant) -> bool {
        if self.prompt_open { return false; }
        let timeout = Duration::from_secs(if self.acknowledged { 30 } else { 3 });
        if self.started.is_some_and(|at| now.saturating_duration_since(at) >= timeout) {
            self.prompt_open = true;
            return true;
        }
        self.started.get_or_insert(now);
        false
    }
    pub fn acknowledge(&mut self) { self.acknowledged = true; }
    pub fn finish(&mut self) { *self = Self::default(); }
    pub fn dismiss_prompt(&mut self, now: Instant) {
        self.prompt_open = false;
        if self.started.is_some() { self.started = Some(now); }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stalled_renderer_requires_a_repeated_request() {
        let now=Instant::now(); let mut p=CloseAttempt::default();
        assert!(!p.request(now)); assert!(!p.request(now+Duration::from_secs(2)));
        assert!(p.request(now+Duration::from_secs(3)));
        assert!(!p.request(now+Duration::from_secs(60)));
        p.dismiss_prompt(now+Duration::from_secs(60));
        assert!(!p.request(now+Duration::from_secs(61)));
    }
    #[test]
    fn acknowledged_blocked_worker_retains_deadline() {
        let now=Instant::now(); let mut p=CloseAttempt::default(); p.request(now);
        let (release,wait)=std::sync::mpsc::channel();
        let worker=std::thread::spawn(move||wait.recv().unwrap());
        p.acknowledge();
        for seconds in [3,10,29] { assert!(!p.request(now+Duration::from_secs(seconds))); p.acknowledge(); }
        assert!(!worker.is_finished()); assert!(p.request(now+Duration::from_secs(30)));
        release.send(()).unwrap(); worker.join().unwrap();
    }
    #[test]
    fn completed_or_cancelled_attempt_resets_deadline() {
        let now=Instant::now(); let mut p=CloseAttempt::default();
        p.request(now); p.acknowledge(); assert!(!p.request(now+Duration::from_secs(20)));
        p.finish(); assert!(!p.request(now+Duration::from_secs(120)));
        assert!(p.request(now+Duration::from_secs(123)));
        p.finish(); p.dismiss_prompt(now+Duration::from_secs(124));
        assert!(!p.request(now+Duration::from_secs(300)));
    }
}
