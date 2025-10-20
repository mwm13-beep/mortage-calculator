
#!/usr/bin/env python3
import argparse, json, mimetypes, os, platform, subprocess, sys
from pathlib import Path
from typing import Optional

try:
    import requests  # type: ignore
except Exception as e:
    print("This script requires the 'requests' package. Install it with:", file=sys.stderr)
    print("  pip install requests", file=sys.stderr)
    sys.exit(2)

DEFAULT_ACCEPT = "application/pdf, application/json;q=0.9, */*;q=0.1"

def guess_ext(content_type: str) -> str:
    if not content_type:
        return ".bin"
    ct = content_type.split(";")[0].strip().lower()
    if ct == "application/pdf":
        return ".pdf"
    if ct == "application/json":
        return ".json"
    if ct in ("text/html", "text/plain", "text/markdown", "text/css", "text/javascript"):
        return ".txt" if ct == "text/plain" else ".html"
    # Fall back to mimetypes
    ext = mimetypes.guess_extension(ct)
    return ext or ".bin"

def open_file(path: Path) -> None:
    system = platform.system()
    if system == "Darwin":
        subprocess.run(["open", str(path)], check=False)
    elif system == "Windows":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.run(["xdg-open", str(path)], check=False)

def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        description="Lightweight curl-like helper for quick API calls (JSON + binary).")
    p.add_argument("url", help="Target URL")
    p.add_argument("-X", "--method", default="POST", choices=["GET","POST","PUT","PATCH","DELETE"], help="HTTP method (default: POST)")
    p.add_argument("-d", "--data", help="Inline JSON string for request body (default: {})", default="{}")
    p.add_argument("--data-file", help="Path to a JSON file to use as the request body")
    p.add_argument("-H", "--header", action="append", default=[], help="Extra header (Key: Value). Can be used multiple times.")
    p.add_argument("-t", "--timeout", type=float, default=20.0, help="Timeout seconds (default: 20)")
    p.add_argument("-o", "--output", help="Output file path (auto-chooses extension if omitted)")
    p.add_argument("--accept", default=DEFAULT_ACCEPT, help=f"Accept header (default: {DEFAULT_ACCEPT})")
    p.add_argument("--content-type", default="application/json", help="Content-Type for request body (default: application/json)")
    p.add_argument("-k", "--insecure", action="store_true", help="Ignore TLS verification (like curl -k)")
    p.add_argument("-O", "--open", action="store_true", dest="open_after", help="Open the saved file after download")
    p.add_argument("-v", "--verbose", action="store_true", help="Print response headers and brief summary")
    p.add_argument("--no-fail", action="store_true", help="Do not fail on HTTP status >= 400")
    args = p.parse_args(argv)

    # Build headers
    headers = {"Accept": args.accept}
    if args.method.upper() in ("POST","PUT","PATCH","DELETE") and args.content_type:
        headers["Content-Type"] = args.content_type
    # Merge user headers
    for h in args.header:
        if ":" not in h:
            print(f"Ignoring malformed header: {h}", file=sys.stderr)
            continue
        k, v = h.split(":", 1)
        headers[k.strip()] = v.strip()

    # Build body
    data_obj = None
    data_bytes = None
    if args.method.upper() in ("POST","PUT","PATCH","DELETE"):
        if args.data_file:
            with open(args.data_file, "rb") as f:
                data_bytes = f.read()
        else:
            # If JSON content-type, ensure it's valid JSON
            if args.content_type.startswith("application/json"):
                try:
                    data_obj = json.loads(args.data) if args.data else {}
                except json.JSONDecodeError as e:
                    print(f"Invalid JSON for --data: {e}", file=sys.stderr)
                    return 2
            else:
                data_bytes = args.data.encode("utf-8")

    method = args.method.upper()
    import requests
    try:
        resp = requests.request(
            method,
            args.url,
            json=data_obj if data_obj is not None else None,
            data=data_bytes if data_bytes is not None else None,
            headers=headers,
            timeout=args.timeout,
            verify=not args.insecure,
            stream=True,
        )
    except requests.RequestException as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 2

    if not args.no_fail and resp.status_code >= 400:
        # Try to print short body for debugging
        snippet = None
        try:
            snippet = resp.text[:400]
        except Exception:
            snippet = "<binary or unavailable>"
        print(f"HTTP {resp.status_code}\n{snippet}", file=sys.stderr)
        return 22  # similar to curl's error on HTTP fail

    # Decide output path
    content_type = resp.headers.get("Content-Type", "")
    if args.output:
        out_path = Path(args.output)
    else:
        ext = guess_ext(content_type)
        out_path = Path(f"out{ext}")

    # Save
    with open(out_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=64 * 1024):
            if chunk:
                f.write(chunk)

    if args.verbose:
        print(f"Saved {out_path}  status={resp.status_code}  content-type={content_type}  bytes={out_path.stat().st_size}")
        # Print a tiny JSON preview if JSON
        if content_type.startswith("application/json"):
            try:
                print(json.dumps(resp.json(), indent=2)[:1000])
            except Exception:
                pass

    if args.open_after:
        open_file(out_path)

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
