import * as dotenv from "dotenv";
dotenv.config();

const groqKey = process.env.GROQ_API_KEY;
if (!groqKey) {
  throw new Error("❌ Error: GROQ_API_KEY is not defined in the environment variables.");
}

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    allowedUserIds: (() => {
      const raw = process.env.TELEGRAM_ALLOWED_USER_IDS || "";
      try {
        if (raw.startsWith("[") && raw.endsWith("]")) {
          return JSON.parse(raw) as number[];
        }
        return raw.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      } catch {
        const cleaned = raw.replace(/[\[\]]/g, "");
        return cleaned.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      }
    })()
  },
  supabase: {
    url: process.env.SUPABASE_URL || "",
    key: process.env.SUPABASE_KEY || ""
  },
  groq: {
    apiKey: groqKey
  }
};
