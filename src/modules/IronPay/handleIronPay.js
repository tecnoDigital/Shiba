import axios from 'axios';
import { parsePhoneNumber } from 'libphonenumber-js';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import { incrementRequest, incrementCommand } from './metrics.js';


dotenv.config();

const IRON_PAY_WEBHOOK = process.env.IRON_PAY_WEBHOOK;
const IRON_NUMBERS = (process.env.IRON_NUMBERS || '').split(',')
  .map(s => s.trim().replace(/^\+/, ''));

// Normalize MX phone to E.164
const normalizeMx = raw => {
  try {
    const num = parsePhoneNumber(raw, 'MX');
    return num.format('E.164');
  } catch {
    return null;
  }
};

// Parse args: phone, name, amount, due, promo
function parseArgs(rawString) {
  const tokens = rawString.trim().split(/\s+/);
  let phone = null, amount = null, due = null, promo = false;
  const promoIndex = tokens.findIndex(t => /^p$/i.test(t));
  if (promoIndex > -1) { promo = true; tokens.splice(promoIndex, 1); }
  const phoneIndex = tokens.findIndex(t => normalizeMx(t));
  if (phoneIndex > -1) { phone = normalizeMx(tokens[phoneIndex]); tokens.splice(phoneIndex, 1); }
  // 3) Monto (con o sin '$')
  const amountIndex = tokens.findIndex(t => /^\$?\d+(?:\.\d{1,2})?$/.test(t));
  if (amountIndex > -1) {
    const num = tokens[amountIndex].replace(/^\$/, '');
    amount = parseInt(num, 10).toLocaleString('es-CL');
    tokens.splice(amountIndex, 1);
  }
  const dateIndex = tokens.findIndex(t => /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})$/.test(t));
  if (dateIndex > -1) {
    const token = tokens[dateIndex];
    const currentYear = dayjs().year();
    let parsedDate = null;
    const parts = token.split(/[\/\-]/);
    if (parts.length === 2) {
      const [day, month] = parts.map(Number);
      parsedDate = dayjs(new Date(currentYear, month - 1, day));
    } else if (parts.length === 3) {
      if (/^\d{4}-/.test(token)) {
        const [year, month, day] = parts.map(Number);
        parsedDate = dayjs(new Date(year, month - 1, day));
      } else {
        const [day, month, year] = parts.map(Number);
        parsedDate = dayjs(new Date(year, month - 1, day));
      }
    }
    if (parsedDate && parsedDate.isValid()) { due = parsedDate.format('YYYY-MM-DD'); }
    tokens.splice(dateIndex, 1);
  }
  const name = tokens.length ? tokens.join(' ') : null;
  return { phone, name, amount, due, promo };
}

const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function formatDateSpan(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split('-');
  return `${parseInt(day)} de ${monthNames[parseInt(month,10)-1]}`;
}

export async function handleIronPay(message, messageData, args, senderQueue) {
  // Metrics
  incrementRequest();
  incrementCommand('ironpay');

  const waId = message.from.split('@')[0];
  if (!IRON_NUMBERS.includes(waId)) {
    senderQueue.enqueue(message.from, '❌ No estás autorizado para usar IronPay.');
    return;
  }
  const rawArgs = args.join(' ');
  const composed = rawArgs.length > 0;

  if (!composed) {
    senderQueue.enqueue(message.from, '❌ Debes proporcionar los detalles para la llamada.');
    return;
  }

  const { phone, name, amount, due, promo } = parseArgs(rawArgs);

  if (!phone) {
    senderQueue.enqueue(message.from, '❌ El número de teléfono del destinatario es obligatorio.');
    return;
  }

  const payload = {
    from_number: `+${waId}`,
    to_number: phone,
    agent_id: "agent_fb41bed5e1aa5ff9452bee4fad",
    retell_llm_dynamic_variables: {
      customer_name: name,
      amount: amount ? `$ ${amount}` : null,
      date: formatDateSpan(due)
    }
  };

  try {
    await axios.post(IRON_PAY_WEBHOOK, payload, { headers: { 'Content-Type': 'application/json' } });
    senderQueue.enqueue(message.from, '✅ Llamada enviada exitosamente.');
  } catch (err) {
    console.error('🔥 Error IronPay:', err.message);
    senderQueue.enqueue(message.from, '🔥 Error enviando la llamada.');
  }
}
