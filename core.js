/* 記賬 — 核心邏輯（純函數，不涉及畫面）
 * 金額一律以「仙」（整數，HK$1 = 100）保存，避免小數誤差。
 * 帳戶餘額不直接儲存，而是由「初始餘額 + 所有交易」按時間順序重新計算，
 * 因此修改或刪除任何交易後，所有餘額及統計都會自動重新計算並保持一致。
 */
(function (g) {
  'use strict';

  const ACCOUNTS = [
    { id: 'cash', name: '現金', short: '現金' },
    { id: 'alipay', name: 'Alipay（支付寶）', short: 'Alipay' },
    { id: 'change', name: '零錢', short: '零錢' },
    { id: 'jar', name: '零錢筒', short: '零錢筒' },
  ];
  const ACC_IDS = ACCOUNTS.map(a => a.id);
  const NAME = Object.fromEntries(ACCOUNTS.map(a => [a.id, a.name]));
  const DEFAULT_INITIAL = { cash: 120000, alipay: 4820, change: 0, jar: 0 };
  const DEFAULT_QUICK = [10000, 5000, 2000, 1000, 500, 200, 100, 50];
  // 這兩個帳戶絕不可透支
  const NO_OVERDRAFT = ['change', 'jar'];
  const TYPE_NAME = { expense: '支出', income: '收入', transfer: '轉帳', adjust: '餘額調整' };

  function defaultState() {
    return {
      version: 1,
      initial: { ...DEFAULT_INITIAL },
      txs: [],
      seq: 0,
      settings: {
        quickAmounts: [...DEFAULT_QUICK],
        inputMode: 'add', // add = 累加, set = 直接設定
        theme: 'auto',
        resetAfter: true, // 記賬後重設為「現金支出」
      },
      meta: { createdAt: Date.now(), lastExport: null },
    };
  }

  /* ---------- 金額 ---------- */
  function toCents(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN;
    const s = String(v == null ? '' : v).trim().replace(/,/g, '');
    if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }
  function fmt(c, opt) {
    opt = opt || {};
    const neg = c < 0;
    const s = 'HK$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (neg) return '−' + s;
    if (opt.sign && c > 0) return '+' + s;
    return s;
  }
  function plain(c) { return (c / 100).toFixed(2); }
  function shortNum(c) {
    const v = c / 100;
    if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
    return '$' + (Number.isInteger(v) ? v : v.toFixed(1));
  }

  /* ---------- 日期 ---------- */
  const pad = n => String(n).padStart(2, '0');
  function dayKey(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthKey(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function fmtTime(t) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDateTime(t) { const d = new Date(t); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + fmtTime(t); }

  /* ---------- 交易效果 ---------- */
  function txTotal(tx) {
    if (tx.type === 'expense') return tx.amount + (tx.change || 0);
    if (tx.type === 'adjust') return tx.target;
    return tx.amount;
  }
  function deltas(tx, bal) {
    const d = { cash: 0, alipay: 0, change: 0, jar: 0 };
    switch (tx.type) {
      case 'expense': d[tx.account] -= tx.amount; if (tx.change) d.change -= tx.change; break;
      case 'income': d[tx.account] += tx.amount; break;
      case 'transfer': d[tx.from] -= tx.amount; d[tx.to] += tx.amount; break;
      case 'adjust': d[tx.account] = tx.target - bal[tx.account]; break;
    }
    return d;
  }
  function involves(tx, acc) {
    if (tx.type === 'expense') return tx.account === acc || (acc === 'change' && tx.change > 0);
    if (tx.type === 'transfer') return tx.from === acc || tx.to === acc;
    return tx.account === acc;
  }
  function cmpTx(a, b) { return a.time - b.time || a.no - b.no; }
  const sumBal = b => ACC_IDS.reduce((s, k) => s + b[k], 0);

  /* 由頭重新計算一切 */
  function compute(state) {
    const bal = { ...state.initial };
    let income = 0, expense = 0, adjust = 0;
    const rows = [], problems = [], byId = {};
    const sorted = [...state.txs].sort(cmpTx);
    for (const tx of sorted) {
      const before = { ...bal };
      const d = deltas(tx, bal);
      for (const k of ACC_IDS) bal[k] += d[k];
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount + (tx.change || 0);
      else if (tx.type === 'adjust') adjust += d[tx.account];
      const after = { ...bal };
      for (const k of ACC_IDS) {
        if (d[k] < 0 && after[k] < 0) problems.push({ tx, account: k, balance: after[k], hard: NO_OVERDRAFT.includes(k) });
      }
      const row = { tx, before, after, delta: d, totalBefore: sumBal(before), totalAfter: sumBal(after) };
      rows.push(row);
      byId[tx.id] = row;
    }
    const total = sumBal(bal);
    const initialTotal = sumBal(state.initial);
    return {
      balances: bal, total, initialTotal, income, expense, adjust, rows, problems, byId,
      expected: initialTotal + income - expense + adjust,
      reconciled: total === initialTotal + income - expense + adjust,
    };
  }

  /* 統計：指定時間範圍 [from, to) */
  function stats(state, comp, from, to) {
    let income = 0, expense = 0, count = 0;
    const daily = {}, monthlyExp = {}, monthlyInc = {}, cats = {};
    let startBal = { ...state.initial }, endBal = { ...state.initial };
    for (const r of comp.rows) {
      const t = r.tx.time;
      if (t < from) { startBal = r.after; endBal = r.after; continue; }
      if (t >= to) break;
      endBal = r.after;
      count++;
      if (r.tx.type === 'expense') {
        const v = txTotal(r.tx);
        expense += v;
        daily[dayKey(t)] = (daily[dayKey(t)] || 0) + v;
        monthlyExp[monthKey(t)] = (monthlyExp[monthKey(t)] || 0) + v;
        const c = (r.tx.item || '其他').trim() || '其他';
        cats[c] = (cats[c] || 0) + v;
      } else if (r.tx.type === 'income') {
        income += r.tx.amount;
        monthlyInc[monthKey(t)] = (monthlyInc[monthKey(t)] || 0) + r.tx.amount;
      }
    }
    return { income, expense, count, daily, monthlyExp, monthlyInc, cats, startBal, endBal };
  }

  /* ---------- 文字快速輸入解析 ---------- */
  const NUM = '(\\d+(?:\\.\\d{1,2})?|\\.\\d{1,2})';
  const ACC_TOKEN = '(現金|零錢筒|零錢|支付寶|Alipay|ALIPAY|alipay|A|a)';
  function tokenToAcc(t) {
    const s = t.toLowerCase();
    if (s === '現金') return 'cash';
    if (s === 'a' || s === '支付寶' || s === 'alipay') return 'alipay';
    if (s === '零錢筒') return 'jar';
    if (s === '零錢') return 'change';
    return null;
  }
  function normalize(s) {
    return String(s || '')
      .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全形轉半形
      .replace(/　/g, ' ')
      .replace(/HK\$|\$/gi, '')
      .replace(/(\d)\s*(元|蚊)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const RE_ADJUST = new RegExp('^' + ACC_TOKEN + '\\s*(?:幫我把?|請)?\\s*(?:餘額)?\\s*(?:設成|設為|設定為|設定成|改成|改為|調整為|調成|=)\\s*' + NUM + '$');
  const RE_INCOME = new RegExp('^(現金|支付寶|Alipay|ALIPAY|alipay|A|a)?\\s*\\+\\s*' + NUM + '$');
  const RE_TRANSFER = new RegExp('^' + ACC_TOKEN + '\\s*(?:轉入|轉去|轉到|轉|->|→|>)\\s*' + ACC_TOKEN + '\\s*' + NUM + '$');
  const RE_EXPENSE = new RegExp('^(.+?)\\s*(A)?\\s*' + NUM + '(?:\\s*\\+\\s*' + NUM + ')?$');

  function parse(input) {
    const s = normalize(input);
    if (!s) return { ok: false, error: '' };
    let m;
    if ((m = s.match(RE_ADJUST))) {
      const account = tokenToAcc(m[1]);
      return { ok: true, tx: { type: 'adjust', account, target: toCents(m[2]), item: '餘額調整' } };
    }
    if ((m = s.match(RE_INCOME))) {
      const account = m[1] ? tokenToAcc(m[1]) : 'cash';
      const amount = toCents(m[2]);
      if (!(amount > 0)) return { ok: false, error: '金額必須大於 0' };
      return { ok: true, tx: { type: 'income', account, amount, item: '收入' } };
    }
    if ((m = s.match(RE_TRANSFER))) {
      const from = tokenToAcc(m[1]), to = tokenToAcc(m[2]), amount = toCents(m[3]);
      if (from === to) return { ok: false, error: '轉出及轉入帳戶不能相同' };
      if (!(amount > 0)) return { ok: false, error: '金額必須大於 0' };
      return { ok: true, tx: { type: 'transfer', from, to, amount, item: '帳戶轉帳' } };
    }
    if ((m = s.match(RE_EXPENSE))) {
      const item = m[1].trim();
      const account = m[2] ? 'alipay' : 'cash';
      const amount = toCents(m[3]);
      const change = m[4] ? toCents(m[4]) : 0;
      if (tokenToAcc(item)) return { ok: false, error: '收入請輸入「' + item + '+金額」，例如 現金+350' };
      if (!(amount + change > 0)) return { ok: false, error: '金額必須大於 0' };
      return { ok: true, tx: { type: 'expense', item, account, amount, change } };
    }
    return { ok: false, error: '看不懂，例子：早餐25、糖A10、早餐30+5、現金+350、A+100、A設成1.48' };
  }

  function describe(tx) {
    switch (tx.type) {
      case 'expense': {
        const total = tx.amount + (tx.change || 0);
        let s = '「' + tx.item + '」支出 ' + fmt(total) + '，';
        if (tx.change > 0 && tx.amount > 0) s += NAME[tx.account] + ' ' + fmt(tx.amount) + ' ＋ 零錢 ' + fmt(tx.change);
        else if (tx.change > 0) s += '零錢支付';
        else s += NAME[tx.account] + '支付';
        return s;
      }
      case 'income': return NAME[tx.account] + '收入 ' + fmt(tx.amount);
      case 'transfer': return NAME[tx.from] + ' → ' + NAME[tx.to] + ' 轉帳 ' + fmt(tx.amount);
      case 'adjust': return NAME[tx.account] + '餘額設定為 ' + fmt(tx.target);
    }
    return '';
  }

  g.Core = {
    ACCOUNTS, ACC_IDS, NAME, DEFAULT_INITIAL, DEFAULT_QUICK, NO_OVERDRAFT, TYPE_NAME,
    defaultState, toCents, fmt, plain, shortNum, dayKey, monthKey, startOfDay, fmtTime, fmtDateTime,
    txTotal, deltas, involves, cmpTx, compute, stats, parse, normalize, describe,
  };
})(typeof window !== 'undefined' ? window : globalThis);
