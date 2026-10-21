import { getLogger } from '../logger/index.js';

const logger = getLogger('telegramService.js');

export async function sendTelegramAlert(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '6683542603';

  if (!token) {
    logger.warn('telegram.skipped', { reason: 'missing_bot_token' });
    return false;
  }

  const base = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${base}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Telegram respondió ${response.status}: ${detail.slice(0, 160)}`);
    }

    logger.info('telegram.alert.sent', { delivered: true });
    return true;
  } catch (error) {
    logger.error('telegram.alert.failed', { error: error.message });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
