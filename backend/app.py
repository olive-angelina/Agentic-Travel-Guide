import os
import json
import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --------- LLM Client (Groq) ---------
from groq import Groq

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    pass

client = None
def get_client():
    global client
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY is missing in .env")
    if client is None:
        client = Groq(api_key=key)
    return client

# --------- FastAPI App ---------
app = FastAPI(title="Agentic Travel Planner ")

# Allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------- Request / Response Models --------
class PlanRequest(BaseModel):
    from_city: str = Field(..., description="Starting city, e.g., Hyderabad")
    destination: str = Field(..., description="Target destination, e.g., Goa")
    start_date: str
    end_date: str
    days: int = Field(..., ge=1, le=30)
    interests: Optional[str] = ""

class PlanResponse(BaseModel):
    itinerary_markdown: str

# -------- Prompt --------
SYSTEM_PROMPT = """
You are a helpful travel planner.
Return a clean day-by-day itinerary in Markdown.
Do NOT use code blocks.

Always include these sections (use these exact titles if possible):
- When to Visit
- Budget (₹)
- Safety Tips
- Food Suggestions
- Day-by-Day Plan
"""

def make_user_prompt(destination: str, days: int, interests: str) -> str:
    return f"""
Destination: {destination}
Days: {days}
Interests: {interests}

Return:
- When to Visit
- Budget (₹)
- Safety Tips
- Food Suggestions
- Day-by-Day Plan
"""

# -------- Trip Plan Endpoint --------
@app.post("/plan", response_model=PlanResponse)
def plan_trip(req: PlanRequest):
    try:
        cli = get_client()
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": make_user_prompt(req.destination, req.days, req.interests)}
        ]

        resp = cli.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.6,
            max_tokens=1200,
        )
        content = resp.choices[0].message.content.strip()
        return PlanResponse(itinerary_markdown=content)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Planner error: {str(e)}")


# ✅ Destination Images
@app.get("/images")
def get_images(destination: str, count: int = 6):
    UNSPLASH_KEY = os.getenv("UNSPLASH_ACCESS_KEY")
    if not UNSPLASH_KEY:
        raise HTTPException(status_code=500, detail="Missing UNSPLASH_ACCESS_KEY in .env")

    url = "https://api.unsplash.com/search/photos"
    params = {
        "query": destination,
        "per_page": count,
        "orientation": "landscape"
    }
    headers = {"Authorization": f"Client-ID {UNSPLASH_KEY}"}

    try:
        res = requests.get(url, params=params, headers=headers).json()
        if "results" in res:
            return [img["urls"]["regular"] for img in res["results"]]
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unsplash error: {str(e)}")


# ✅ Hotel Recommendations with images
@app.get("/hotels")
def get_hotels(destination: str = Query(..., description="City where hotels are needed"), count: int = 6):
    """
    Returns a list of hotels with: name, price, rating, description, image.
    LLM generates hotel info; Unsplash provides images.
    """
    try:
        cli = get_client()
        # Ask the model to return STRICT JSON
        sys = (
            "Return ONLY a JSON array (no prose). Each item must have "
            "name, price, rating, description. Example:\n"
            "[{\"name\":\"Hotel A\",\"price\":\"₹4500/night\",\"rating\":\"4.4\",\"description\":\"Near beach...\"}]"
        )
        user = (
            f"Give {count} well-known hotels in {destination}, mixed across economy, mid-range and premium."
            " Use concise descriptions and realistic Indian-price style like '₹4500/night'."
        )
        resp = cli.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role":"system","content":sys},{"role":"user","content":user}],
            temperature=0.4,
            max_tokens=700,
        )

        raw = resp.choices[0].message.content.strip()
        # Try to parse JSON safely
        try:
            hotels = json.loads(raw)
        except Exception:
            # If model accidentally wrapped in code fences, try to extract JSON
            start = raw.find('[')
            end = raw.rfind(']')
            hotels = json.loads(raw[start:end+1]) if start!=-1 and end!=-1 else []

        if not isinstance(hotels, list):
            hotels = []

        # Attach an Unsplash image for each hotel
        UNSPLASH_KEY = os.getenv("UNSPLASH_ACCESS_KEY")
        headers = {"Authorization": f"Client-ID {UNSPLASH_KEY}"} if UNSPLASH_KEY else None
        for h in hotels:
            name = h.get("name","")
            q = f"{name} {destination}"
            img_url = None
            if headers:
                try:
                    r = requests.get(
                        "https://api.unsplash.com/search/photos",
                        params={"query": q, "per_page": 1, "orientation": "landscape"},
                        headers=headers
                    ).json()
                    img_url = (r.get("results") or [{}])[0].get("urls", {}).get("regular")
                except Exception:
                    img_url = None
            # Fallback to source endpoint if API key rate-limits
            if not img_url:
                img_url = f"https://source.unsplash.com/600x400/?{q.replace(' ','+')}"

            h["image"] = img_url

        # Limit to count
        hotels = hotels[:count]
        return hotels

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hotels error: {str(e)}")
