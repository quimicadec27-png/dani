import { Bot } from "grammy";
import { config } from "../config.js";

const token = config.telegram.token;
if (!token) {
  console.error("❌ Error: TELEGRAM_BOT_TOKEN is not defined in the environment variables.");
  process.exit(1);
}

export const bot = new Bot(token);
