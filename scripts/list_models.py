"""Print every model on your Nebius Token Factory account; filter with an arg.
Usage: python scripts/list_models.py [substring]   e.g. nemotron
"""
import os, sys
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI(base_url=os.environ["NEBIUS_BASE_URL"], api_key=os.environ["NEBIUS_API_KEY"])
needle = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
for m in sorted(client.models.list(), key=lambda m: m.id):
    if needle in m.id.lower():
        print(m.id)
