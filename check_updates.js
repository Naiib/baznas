import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

async function checkUpdates() {
  try {
    const updates = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=10`);
    const data = await updates.json();
    console.log('Total updates:', data.result.length);
    data.result.forEach((u, i) => {
      const msg = u.message || u.edited_message || u.callback_query;
      console.log(`[${i}]`, {
        update_id: u.update_id,
        chat_id: msg?.chat?.id,
        username: msg?.chat?.username,
        text: msg?.text,
        date: msg?.date,
      });
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkUpdates();
