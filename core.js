/* 記賬 — 核心邏輯（純函數，不涉及畫面）
 * 金額一律以「仙」（整數，$1 = 100）保存，避免小數誤差。
 * 帳戶餘額不直接儲存，而是由「初始餘額 + 所有交易」按時間順序重新計算，
 * 因此修改或刪除任何交易後，所有餘額及統計都會自動重新計算並保持一致。
 */
(function (g) {
  'use strict';

  /* ---------- 帳戶（付款方式） ---------- */
  // 現金、零錢、零錢筒為內建帳戶；Alipay 為可選帳戶（可在設定啟用／停用）；使用者可另外新增（信用卡、八達通、銀行卡…）
  const BUILTIN = [
    { id: 'cash', name: '現金', short: '現金', kind: 'asset', builtin: true, color: '#d9581c' },
    { id: 'alipay', name: 'Alipay（支付寶）', short: 'Alipay', kind: 'asset', builtin: true, optional: true, color: '#1f6fd1' },
    { id: 'change', name: '零錢', short: '零錢', kind: 'asset', builtin: true, color: '#9a6b00' },
    { id: 'jar', name: '零錢筒', short: '零錢筒', kind: 'asset', builtin: true, color: '#7a5bd6' },
  ];
  const PALETTE = ['#0f9aa8', '#d4537e', '#1a8f44', '#5b6b7a', '#c98500', '#6250d6', '#e34948', '#2a78d6'];
  // 以下三個物件會被 setAccounts() 就地更新，其他程式可一直引用同一個物件
  const ACCOUNTS = [];
  const ACC_IDS = [];
  const NAME = {};
  const ACC = {};
  // off：已停用的可選帳戶 id（停用後保留過往紀錄，只是不再出現在選項中）
  function setAccounts(custom, off) {
    ACCOUNTS.length = 0; ACC_IDS.length = 0;
    for (const k in NAME) delete NAME[k];
    for (const k in ACC) delete ACC[k];
    const list = BUILTIN.map(a => ({ ...a })).concat((custom || []).map((a, i) => ({
      id: a.id, name: a.name, short: a.name, kind: a.kind === 'credit' ? 'credit' : 'asset', builtin: false,
      color: a.color || PALETTE[i % PALETTE.length],
    })));
    for (const a of list) { if (a.optional && (off || []).includes(a.id)) a.off = true; ACCOUNTS.push(a); ACC_IDS.push(a.id); NAME[a.id] = a.name; ACC[a.id] = a; }
  }
  setAccounts([]);
  // 可用作支出／收入的帳戶（零錢及零錢筒有專用規則，不在此列）
  const payable = () => ACCOUNTS.filter(a => !a.off && a.id !== 'change' && a.id !== 'jar');
  // 目前使用中的帳戶（不含已停用）
  const active = () => ACCOUNTS.filter(a => !a.off);
  const isOff = id => !!(ACC[id] && ACC[id].off);

  const DEFAULT_INITIAL = { cash: 0, alipay: 0, change: 0, jar: 0 };
  const DEFAULT_QUICK = [10000, 5000, 2000, 1000, 500, 200, 100, 50];
  // 常用捷徑：amount 為 0 代表不預設金額，點擊後再輸入
  const DEFAULT_SHORTCUTS = [
    { id: 'sc-breakfast', name: '早餐', type: 'expense', account: 'cash', amount: 0 },
    { id: 'sc-lunch', name: '午餐', type: 'expense', account: 'cash', amount: 0 },
    { id: 'sc-dinner', name: '晚餐', type: 'expense', account: 'cash', amount: 0 },
    { id: 'sc-water', name: '買水', type: 'expense', account: 'cash', amount: 0 },
    { id: 'sc-transport', name: '交通', type: 'expense', account: 'cash', amount: 0 },
    { id: 'sc-pocket', name: '零用錢', type: 'income', account: 'cash', amount: 0 },
    { id: 'sc-salary', name: '薪金', type: 'income', account: 'cash', amount: 0 },
  ];
  // 這兩個帳戶絕不可透支
  const NO_OVERDRAFT = ['change', 'jar'];
  const TYPE_NAME = { expense: '支出', income: '收入', transfer: '轉帳', adjust: '餘額調整' };

  /* ---------- 貨幣（只影響顯示符號，不作匯率換算） ---------- */
  const CURRENCIES = [
    { code: 'HKD', sym: 'HK$', name: '港幣' },
    { code: 'MOP', sym: 'MOP$', name: '澳門幣' },
    { code: 'CNY', sym: '¥', name: '人民幣' },
    { code: 'TWD', sym: 'NT$', name: '新台幣' },
    { code: 'USD', sym: 'US$', name: '美元' },
    { code: 'JPY', sym: 'JP¥', name: '日圓' },
    { code: 'EUR', sym: '€', name: '歐元' },
    { code: 'GBP', sym: '£', name: '英鎊' },
    { code: 'SGD', sym: 'S$', name: '新加坡元' },
    { code: 'MYR', sym: 'RM', name: '馬來西亞令吉' },
    { code: 'KRW', sym: '₩', name: '韓圓' },
  ];
  let CUR = 'HK$';
  function setCurrency(code) { const c = CURRENCIES.find(x => x.code === code); CUR = c ? c.sym : 'HK$'; }
  const cur = () => CUR;

  function defaultState() {
    return {
      version: 1,
      initial: { ...DEFAULT_INITIAL },
      accounts: [], // 使用者自訂付款方式 [{id, name, kind: 'asset'|'credit', color}]
      txs: [],
      seq: 0,
      settings: {
        quickAmounts: [...DEFAULT_QUICK],
        inputMode: 'add', // add = 累加, set = 直接設定
        theme: 'auto',
        resetAfter: true, // 記賬後重設為「現金支出」
        shortcuts: DEFAULT_SHORTCUTS.map(s => ({ ...s })),
        shortcutDirect: false, // 點擊有金額的捷徑時直接記賬
        currency: 'HKD',
        offAcc: ['alipay'], // 新用戶預設不啟用 Alipay
        lang: 'zh-Hant',
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
    c = c || 0;
    const neg = c < 0;
    const s = CUR + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (neg) return '−' + s;
    if (opt.sign && c > 0) return '+' + s;
    return s;
  }
  function plain(c) { return (c / 100).toFixed(2); }
  function shortNum(c) {
    const v = c / 100;
    if (Math.abs(v) >= 1000) return CUR + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
    return CUR + (Number.isInteger(v) ? v : v.toFixed(1));
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
    const d = {};
    const add = (k, v) => { d[k] = (d[k] || 0) + v; };
    switch (tx.type) {
      case 'expense': add(tx.account, -tx.amount); if (tx.change) add('change', -tx.change); break;
      case 'income': add(tx.account, tx.amount); break;
      case 'transfer': add(tx.from, -tx.amount); add(tx.to, tx.amount); break;
      case 'adjust': add(tx.account, tx.target - (bal[tx.account] || 0)); break;
    }
    return d;
  }
  function involves(tx, acc) {
    if (tx.type === 'expense') return tx.account === acc || (acc === 'change' && tx.change > 0);
    if (tx.type === 'transfer') return tx.from === acc || tx.to === acc;
    return tx.account === acc;
  }
  function cmpTx(a, b) { return a.time - b.time || a.no - b.no; }
  const sumBal = b => Object.keys(b).reduce((s, k) => s + b[k], 0);
  function initialBalances(state) {
    const b = {};
    for (const id of ACC_IDS) b[id] = (state.initial && state.initial[id]) || 0;
    return b;
  }

  /* 由頭重新計算一切 */
  function compute(state) {
    const bal = initialBalances(state);
    const initialTotal = sumBal(bal);
    let income = 0, expense = 0, adjust = 0;
    const rows = [], problems = [], byId = {};
    const sorted = [...state.txs].sort(cmpTx);
    for (const tx of sorted) {
      const before = { ...bal };
      const d = deltas(tx, bal);
      for (const k in d) {
        if (!(k in bal)) { bal[k] = 0; before[k] = 0; }
        bal[k] += d[k];
      }
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount + (tx.change || 0);
      else if (tx.type === 'adjust') adjust += d[tx.account];
      const after = { ...bal };
      for (const k in d) {
        const credit = ACC[k] && ACC[k].kind === 'credit'; // 信用卡可以是負數（欠款）
        if (d[k] < 0 && after[k] < 0 && !credit) problems.push({ tx, account: k, balance: after[k], hard: NO_OVERDRAFT.includes(k) });
      }
      const row = { tx, before, after, delta: d, totalBefore: sumBal(before), totalAfter: sumBal(after) };
      rows.push(row);
      byId[tx.id] = row;
    }
    const total = sumBal(bal);
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
    let startBal = initialBalances(state), endBal = startBal;
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
  function tokenToAcc(t) {
    const s = String(t || '').trim();
    const l = s.toLowerCase();
    if (s === '現金' || l === 'cash') return 'cash';
    if (l === 'a' || s === '支付寶' || l === 'alipay') return 'alipay';
    if (s === '零錢筒' || l === 'jar') return 'jar';
    if (s === '零錢' || l === 'change') return 'change';
    const c = ACCOUNTS.find(a => !a.builtin && a.name.toLowerCase() === l);
    return c ? c.id : null;
  }
  function normalize(s) {
    return String(s || '')
      .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全形轉半形
      .replace(/　/g, ' ')
      .replace(/(HK|MOP|US|NT|S)\$|JP¥|\$|¥|€|£|₩/gi, '')
      .replace(/(\d)\s*(元|蚊|塊)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const RE_ADJUST = new RegExp('^(.+?)\\s*(?:幫我把?|請)?\\s*(?:餘額)?\\s*(?:設成|設為|設定為|設定成|改成|改為|調整為|調成|set to|=)\\s*' + NUM + '$', 'i');
  const RE_INCOME = new RegExp('^(.*?)\\s*\\+\\s*' + NUM + '$');
  const RE_TRANSFER = new RegExp('^(.+?)\\s*(?:轉入|轉去|轉到|轉|->|→|>| to )\\s*(.+?)\\s*' + NUM + '$', 'i');
  const RE_EXPENSE = new RegExp('^(.+?)\\s*(A)?\\s*' + NUM + '(?:\\s*\\+\\s*' + NUM + ')?$');

  function parse(input) {
    const r = parse0(input);
    if (r.ok) {
      const t = r.tx, ids = t.type === 'transfer' ? [t.from, t.to] : [t.account];
      const off = ids.find(isOff);
      if (off) return { ok: false, error: NAME[off] + '已停用，可在「設定 → 付款方式」重新啟用' };
    }
    if (!r.ok && r.error === ERR_EXAMPLE && isOff('alipay')) r.error = '看不懂，例子：早餐25、早餐30+5、現金+350、現金設成100';
    return r;
  }
  const ERR_EXAMPLE = '看不懂，例子：早餐25、糖A10、早餐30+5、現金+350、A+100、A設成1.48';
  function parse0(input) {
    const s = normalize(input);
    if (!s) return { ok: false, error: '' };
    let m;
    if ((m = s.match(RE_ADJUST)) && tokenToAcc(m[1])) {
      const account = tokenToAcc(m[1]);
      return { ok: true, tx: { type: 'adjust', account, target: toCents(m[2]), item: '餘額調整' } };
    }
    if ((m = s.match(RE_INCOME))) {
      const account = m[1] === '' ? 'cash' : tokenToAcc(m[1]);
      if (account && account !== 'jar' && account !== 'change') {
        const amount = toCents(m[2]);
        if (!(amount > 0)) return { ok: false, error: '金額必須大於 0' };
        return { ok: true, tx: { type: 'income', account, amount, item: '收入' } };
      }
    }
    if ((m = s.match(RE_TRANSFER)) && tokenToAcc(m[1]) && tokenToAcc(m[2])) {
      const from = tokenToAcc(m[1]), to = tokenToAcc(m[2]), amount = toCents(m[3]);
      if (from === to) return { ok: false, error: '轉出及轉入帳戶不能相同' };
      if (!(amount > 0)) return { ok: false, error: '金額必須大於 0' };
      return { ok: true, tx: { type: 'transfer', from, to, amount, item: '帳戶轉帳' } };
    }
    if ((m = s.match(RE_EXPENSE))) {
      let item = m[1].trim();
      let account = m[2] ? 'alipay' : 'cash';
      let amount = toCents(m[3]);
      let change = m[4] ? toCents(m[4]) : 0;
      if (tokenToAcc(item)) return { ok: false, error: '收入請輸入「' + item + '+金額」，例如 現金+350' };
      // 「早餐八達通25」：項目後面接付款方式名稱
      if (!m[2]) {
        const names = ACCOUNTS.filter(a => a.id !== 'jar' && !a.off).map(a => [a.id, a.builtin ? (a.id === 'alipay' ? '支付寶' : a.name) : a.name])
          .sort((x, y) => y[1].length - x[1].length);
        for (const [id, nm] of names) {
          if (item.length > nm.length && item.toLowerCase().endsWith(nm.toLowerCase())) {
            item = item.slice(0, -nm.length).trim();
            if (id === 'change') { change = amount + change; amount = 0; account = 'cash'; } else account = id;
            break;
          }
        }
      }
      if (!(amount + change > 0)) return { ok: false, error: '金額必須大於 0' };
      return { ok: true, tx: { type: 'expense', item, account, amount, change } };
    }
    return { ok: false, error: ERR_EXAMPLE };
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
    ACCOUNTS, ACC_IDS, NAME, ACC, BUILTIN, PALETTE, setAccounts, payable, active, isOff,
    DEFAULT_INITIAL, DEFAULT_QUICK, DEFAULT_SHORTCUTS, NO_OVERDRAFT, TYPE_NAME,
    CURRENCIES, setCurrency, cur,
    defaultState, toCents, fmt, plain, shortNum, dayKey, monthKey, startOfDay, fmtTime, fmtDateTime,
    txTotal, deltas, involves, cmpTx, compute, stats, parse, normalize, describe, initialBalances,
  };
})(typeof window !== 'undefined' ? window : globalThis);
