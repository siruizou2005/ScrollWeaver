import json
import os
import urllib.request
import urllib.error

def test_api():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        try:
            with open("config.json", "r") as f:
                config = json.load(f)
                api_key = config.get("GEMINI_API_KEY") or config.get("GOOGLE_API_KEY")
        except:
            print("No API key found")
            return

    models = ["gemini-1.5-flash", "gemini-1.5-flash-001", "gemini-pro", "gemini-1.5-pro-latest"]
    
    for model in models:
        print(f"Testing model: {model}...")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        data = {
            "contents": [{"parts": [{"text": "Hello, are you working?"}]}]
        }
        
        try:
            req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode("utf-8"))
                print(f"  SUCCESS: {result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'No text')}")
                return # Found a working one
        except urllib.error.HTTPError as e:
            print(f"  FAILED ({e.code}): {e.read().decode('utf-8')}")
        except Exception as e:
            print(f"  ERROR: {e}")

if __name__ == "__main__":
    test_api()
