import { P0Error } from './errors.js';

const MONEY_RE = /^(?:0|[0-9]+)(?:\.([0-9]{1,2}))?$/;
const MAX_CENTS = 999999999999999n; // NUMERIC(15,2), at most 13 integer digits.

function asMoneyString(value) {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'string') {
    throw new P0Error('MONEY_FORMAT', 'Money must be an exact decimal string.');
  }
  return value.trim();
}

/** Parse a non-negative decimal money value into exact integer cents. */
export function parseMoney(value, { allowNegative = false } = {}) {
  let text = asMoneyString(value);
  let negative = false;
  if (text.startsWith('-')) {
    if (!allowNegative) throw new P0Error('MONEY_NON_NEGATIVE', 'Money must not be negative.');
    negative = true;
    text = text.slice(1);
  }
  if (!MONEY_RE.test(text)) {
    throw new P0Error(text.includes('.') && text.split('.')[1].length > 2 ? 'MONEY_SCALE' : 'MONEY_FORMAT', 'Money must use at most two decimal places.');
  }
  const [wholeText, fractionText = ''] = text.split('.');
  const whole = BigInt(wholeText || '0');
  const fraction = BigInt((fractionText + '00').slice(0, 2));
  let cents = (whole * 100n) + fraction;
  if (negative) cents = -cents;
  if (cents > MAX_CENTS || cents < -MAX_CENTS) {
    throw new P0Error('MONEY_RANGE', 'Money exceeds NUMERIC(15,2) range.');
  }
  return cents;
}

export function formatMoney(cents) {
  if (typeof cents !== 'bigint') cents = BigInt(cents);
  if (cents > MAX_CENTS || cents < -MAX_CENTS) throw new P0Error('MONEY_RANGE', 'Money exceeds NUMERIC(15,2) range.');
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

export function sumMoney(values, ...rest) {
  const list = Array.isArray(values) ? values : [values, ...rest];
  const total = list.reduce((sum, item) => sum + parseMoney(item), 0n);
  if (total > MAX_CENTS || total < -MAX_CENTS) throw new P0Error('MONEY_RANGE', 'Money exceeds NUMERIC(15,2) range.');
  return formatMoney(total);
}

const SMALL = Object.freeze([
  'Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan',
  'Sepuluh', 'Sebelas',
]);

function wordsUnderThousand(value) {
  if (value < 12) return SMALL[value];
  if (value < 20) return `${SMALL[value - 10]} Belas`;
  if (value < 100) return `${SMALL[Math.floor(value / 10)]} Puluh${value % 10 ? ` ${wordsUnderThousand(value % 10)}` : ''}`;
  if (value < 200) return `Seratus${value % 100 ? ` ${wordsUnderThousand(value % 100)}` : ''}`;
  return `${wordsUnderThousand(Math.floor(value / 100))} Ratus${value % 100 ? ` ${wordsUnderThousand(value % 100)}` : ''}`;
}

const SCALES = Object.freeze(['', 'Ribu', 'Juta', 'Miliar', 'Triliun', 'Kuadriliun']);

function wordsInteger(value) {
  if (value === 0n) return 'Nol';
  let remainder = value;
  let scale = 0;
  const parts = [];
  while (remainder > 0n) {
    const group = Number(remainder % 1000n);
    if (group) {
      let phrase = wordsUnderThousand(group);
      if (scale === 1 && group === 1) phrase = 'Seribu';
      else if (scale > 0) phrase = `${phrase} ${SCALES[scale]}`;
      parts.unshift(phrase);
    }
    remainder /= 1000n;
    scale += 1;
  }
  return parts.join(' ');
}

/** Convert exact Rupiah money to Indonesian words without floating point. */
export function terbilangRupiah(value) {
  const cents = parseMoney(value);
  const whole = cents / 100n;
  const fraction = cents % 100n;
  let result = `${wordsInteger(whole)} Rupiah`;
  if (fraction) result += ` ${wordsInteger(fraction)} Sen`;
  return result;
}

export { MAX_CENTS };
