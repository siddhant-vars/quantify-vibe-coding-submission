import os


def load_dotenv():
    env_file = os.path.join(os.getcwd(), ".env")
    if not os.path.isfile(env_file):
        return

    with open(env_file, encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].lstrip()
            key, separator, value = line.partition("=")
            if separator and key.strip():
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                    value = value[1:-1]
                os.environ.setdefault(key.strip(), value)

load_dotenv()


class Settings:
    provider = os.getenv("LLM_PROVIDER", "groq").lower()  # groq | anthropic | openai
    groq_key = os.getenv("GROQ_API_KEY", "")
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    mongo_db = os.getenv("MONGO_DB", "ai_chat")
    cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]
    max_history = 40       # messages sent to the model per request
    max_tokens = 2048


settings = Settings()
