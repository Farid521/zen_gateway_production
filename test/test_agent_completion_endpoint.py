import json
import time
import urllib.error
import urllib.request

BASE_URL = "http://localhost:3000"
ENDPOINT = "/v1/chat/completions"  # route agent_completion


def main():
    payload = {
        "model": "test",
        "messages": [{"role": "user", "content": "hai, jawab 1 kata"}],
    }
    req = urllib.request.Request(
        BASE_URL + ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            latency_ms = (time.perf_counter() - start) * 1000
            body = json.loads(res.read().decode("utf-8"))
            print(f"HTTP {res.status} | Latency: {latency_ms:.0f} ms")
            print(json.dumps(body, indent=2, ensure_ascii=False))
    except urllib.error.HTTPError as e:
        latency_ms = (time.perf_counter() - start) * 1000
        print(f"HTTP {e.code} | Latency: {latency_ms:.0f} ms")
        print(e.read().decode("utf-8"))
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()