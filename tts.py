import os
import httpx
from dotenv import load_dotenv

load_dotenv()
body = {
    "text": "Hello, world!",
    "format": "mp3",
    "voice_id": "711cf3ed00ab441a8f54a45058047b7a",
}

API_KEY = "sk-fish-cliApeORdT3-6XOd8j5Sbba4CA-5XagPtLM-xA4A62g"

with httpx.Client() as client:
    res = client.post(
        "https://api.fish.audio/v1/tts",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "model": "s2.1-pro-free",
        },
        json=body,
    )

res.raise_for_status()

with open("output.mp3", "wb") as f:
    f.write(res.content)


# import os
# import httpx
# from dotenv import load_dotenv

# load_dotenv()

# API_KEY = "sk-fish-cliApeORdT3-6XOd8j5Sbba4CA-5XagPtLM-xA4A62g"

# if not API_KEY:
#     raise ValueError(
#         "FISH_API_KEY is missing. Check your .env file."
#     )

# body = {
#     "text": "hi, how are you doing today?",
#     "voice_id": "711cf3ed00ab441a8f54a45058047b7a",
#     "format": "mp3",
# }

# headers = {
#     "Authorization": f"Bearer {API_KEY.strip()}",
#     "Content-Type": "application/json",
#     "model": "s2.1-pro-free",
# }

# try:
#     with httpx.Client(timeout=60.0) as client:
#         res = client.post(
#             "https://api.fish.audio/v1/tts",
#             headers=headers,
#             json=body,
#         )

#     if res.status_code != 200:
#         print("Status code:", res.status_code)
#         print("API error:", res.text)
#         res.raise_for_status()

#     with open("output.mp3", "wb") as f:
#         f.write(res.content)

#     print("Audio saved successfully to output.mp3")

# except httpx.HTTPError as e:
#     print("Request failed:", str(e))
