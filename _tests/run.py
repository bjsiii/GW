#!/usr/bin/env python
"""CFITOOLS test runner — no Node required.

Serves the repo over localhost, drives the test page (and a bundled-index smoke
test) through headless Edge/Chrome, and reports pass/fail.

  python _tests/run.py            # run the suite
  python _tests/run.py --verbose  # also print every PASS line
"""
import http.server, os, re, socket, socketserver, subprocess, sys, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_browser():
    for p in BROWSERS:
        if os.path.exists(p):
            return p
    sys.exit("No Edge/Chrome found for headless run. Checked:\n  " + "\n  ".join(BROWSERS))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def dump_dom(browser, url, budget_ms=25000):
    out = subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--disable-sync", "--no-default-browser-check",
         f"--virtual-time-budget={budget_ms}", "--dump-dom", url],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    return out.stdout or ""


def main():
    verbose = "--verbose" in sys.argv
    browser = find_browser()
    port = free_port()
    os.chdir(ROOT)
    if not os.path.isdir(os.path.join(ROOT, "_src")):
        # fresh clone: _src/ is gitignored; regenerate it from the bundle
        subprocess.run([sys.executable, os.path.join(ROOT, "_bundle.py"), "extract"], check=True)
    httpd = socketserver.TCPServer(("127.0.0.1", port), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    failures = 0
    try:
        # 1 — unit + integration suite against _src
        dom = dump_dom(browser, f"http://127.0.0.1:{port}/_tests/tests.html")
        m = re.search(r"CFITOOLS-TESTS: (\d+) passed, (\d+) failed, (\d+) total", dom)
        if not m:
            print("FATAL: test page produced no summary (babel/vendor load failure?)")
            err = re.search(r'id="__bundler_err"[^>]*>([^<]*)', dom)
            if err:
                print("  page error:", err.group(1)[:500])
            return 2
        passed, failed, total = map(int, m.groups())
        for line in re.findall(r'<div class="(?:pass|fail)">([^<]*)</div>', dom):
            if line.startswith("FAIL") or verbose:
                print(" ", line)
        print(f"\nsuite: {passed}/{total} passed, {failed} failed")
        failures += failed

        # 2 — smoke test: the shipped bundled index.html actually boots
        dom = dump_dom(browser, f"http://127.0.0.1:{port}/index.html", budget_ms=30000)
        boot_ok = 'class="pbar"' in dom and 'class="jib"' in dom
        bundle_err = re.search(r'id="__bundler_err"[^>]*>([^<]*)', dom)
        if boot_ok and not bundle_err:
            print("bundle: index.html boots headless — OK")
        else:
            print("bundle: FAILED to boot index.html")
            if bundle_err:
                print("  page error:", bundle_err.group(1)[:500])
            failures += 1
    finally:
        httpd.shutdown()

    print("\nRESULT:", "GREEN" if failures == 0 else f"RED ({failures} failing)")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
