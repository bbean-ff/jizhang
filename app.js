/* 記賬 — 介面 */
(function () {
  'use strict';
  const C = window.Core;
  const { fmt, NAME } = C;
  const KEY = 'jizhang.v1';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const BUILTIN_COLOR = { cash: 'var(--m-cash-exp)', alipay: 'var(--m-ali-exp)', change: 'var(--m-change)', jar: '#7a5bd6' };
  const accColor = id => BUILTIN_COLOR[id] || (C.ACC[id] && C.ACC[id].color) || '#7a7974';
  const accShort = id => (C.ACC[id] && C.ACC[id].short) || NAME[id] || id;
  const WEEK = '日一二三四五六';

  /* ================= 資料 ================= */
  let state = load();
  applyEnv();
  let comp = C.compute(state);
  // 套用帳戶清單、貨幣（載入或匯入資料後呼叫）
  function applyEnv() {
    C.setAccounts(state.accounts);
    C.setCurrency(state.settings.currency);
  }
  const undoStack = [];

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {
      console.error(e);
      try { if (raw) localStorage.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch (_) { /* ignore */ }
    }
    return C.defaultState();
  }
  function migrate(s) {
    const d = C.defaultState();
    if (s.settings && !Array.isArray(s.settings.shortcuts)) delete s.settings.shortcuts;
    return {
      ...d, ...s,
      initial: { ...d.initial, ...(s.initial || {}) },
      settings: { ...d.settings, ...(s.settings || {}) },
      meta: { ...d.meta, ...(s.meta || {}) },
      txs: Array.isArray(s.txs) ? s.txs : [],
      accounts: Array.isArray(s.accounts) ? s.accounts.filter(a => a && a.id && a.name) : [],
      seq: Number.isFinite(s.seq) ? s.seq : (Array.isArray(s.txs) ? s.txs.reduce((m, t) => Math.max(m, t.no || 0), 0) : 0),
    };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert('儲存失敗：' + e.message + '\n請盡快匯出備份。'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function newTx(f) {
    state.seq += 1;
    return {
      id: uid(), no: state.seq, time: f.time || Date.now(), type: f.type, item: f.item || '',
      account: f.account, amount: f.amount, change: f.change, from: f.from, to: f.to, target: f.target,
      note: f.note || '', createdAt: Date.now(),
    };
  }
  function clean(tx) { // 移除沒用的欄位
    const o = {};
    for (const k in tx) if (tx[k] !== undefined) o[k] = tx[k];
    if (o.type !== 'expense') delete o.change;
    return o;
  }

  /* 檢查透支：零錢 / 零錢筒 絕不可透支；現金 / Alipay 不足時要求確認 */
  function validate(newTxs, focusId) {
    const existing = new Set(comp.problems.filter(p => p.hard).map(p => p.tx.id + p.account));
    const r = C.compute({ ...state, txs: newTxs });
    const hard = r.problems.filter(p => p.hard && !existing.has(p.tx.id + p.account));
    if (hard.length) {
      const p = hard[0];
      alert(NAME[p.account] + '不足，不可透支。\n\n處理「' + (p.tx.item || C.TYPE_NAME[p.tx.type]) + '」後，' + NAME[p.account] + '會變成 ' + fmt(p.balance) + '。');
      return false;
    }
    const soft = r.problems.filter(p => !p.hard && p.tx.id === focusId);
    if (soft.length) {
      const p = soft[0];
      if (!confirm(NAME[p.account] + '餘額不足，記賬後會變成 ' + fmt(p.balance) + '。\n仍要繼續嗎？')) return false;
    }
    return true;
  }
  function commit(newTxs, label, extra) {
    undoStack.push({ txs: state.txs, initial: { ...state.initial }, label });
    if (undoStack.length > 50) undoStack.shift();
    state.txs = newTxs;
    if (extra) extra();
    save();
    refresh();
    toast(label, true);
  }
  function apply(newTxs, focusId, label) {
    if (!validate(newTxs, focusId)) return false;
    commit(newTxs, label);
    return true;
  }
  function addTx(fields) {
    if (fields.type === 'expense' && fields.change > 0 && fields.change > comp.balances.change && !fields.time) {
      alert('零錢不足，不可透支。\n\n目前零錢：' + fmt(comp.balances.change) + '\n需要零錢：' + fmt(fields.change));
      return false;
    }
    const tx = clean(newTx(fields));
    const ok = apply([...state.txs, tx], tx.id, '已記賬：' + C.describe(tx));
    if (!ok) { state.seq -= 1; }
    return ok;
  }
  function undo() {
    const u = undoStack.pop();
    if (!u) { toast('沒有可撤銷的操作'); return; }
    state.txs = u.txs;
    state.initial = u.initial;
    save();
    refresh();
    toast('已撤銷：' + u.label.replace(/^已/, ''));
  }

  /* ================= 共用 UI ================= */
  let toastTimer = null;
  function toast(msg, withUndo) {
    const el = $('#toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (withUndo ? '<button type="button" data-undo>撤銷</button>' : '');
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, withUndo ? 5000 : 2600);
  }
  $('#toast').addEventListener('click', e => {
    if (e.target.closest('[data-undo]')) { $('#toast').hidden = true; undo(); }
  });

  function openSheet(title, html, mount) {
    $('#sheet-title').textContent = title;
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    if (mount) mount($('#sheet-body'));
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    document.body.style.overflow = '';
  }
  $('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

  function dayLabel(t) {
    const d = new Date(t);
    const today = C.startOfDay(Date.now());
    const s = C.startOfDay(t);
    const base = (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + WEEK[d.getDay()];
    if (s === today) return '今日 · ' + base;
    if (s === today - DAY) return '昨日 · ' + base;
    if (d.getFullYear() !== new Date().getFullYear()) return d.getFullYear() + '年' + base;
    return base;
  }
  function payText(t) {
    if (t.change > 0 && t.amount > 0) return NAME[t.account] + ' ＋ 零錢 ' + fmt(t.change);
    if (t.change > 0) return '零錢';
    return NAME[t.account];
  }
  function txRowHtml(r, opt) {
    opt = opt || {};
    const t = r.tx;
    let ic, cls, title, meta, amt, amtCls = '';
    switch (t.type) {
      case 'expense':
        ic = '支'; cls = 'expense' + (t.account === 'alipay' ? ' ali' : ''); title = t.item || '其他';
        meta = payText(t); amt = '−' + fmt(C.txTotal(t)); amtCls = 'neg'; break;
      case 'income':
        ic = '收'; cls = 'income' + (t.account === 'alipay' ? ' ali' : ''); title = t.item || '收入';
        meta = NAME[t.account]; amt = '+' + fmt(t.amount); amtCls = 'pos'; break;
      case 'transfer':
        ic = '⇄'; cls = 'transfer'; title = t.item || '帳戶轉帳';
        meta = NAME[t.from] + ' → ' + NAME[t.to]; amt = fmt(t.amount); break;
      case 'adjust':
        ic = '±'; cls = 'adjust'; title = '餘額調整 · ' + NAME[t.account];
        meta = fmt(r.before[t.account]) + ' → ' + fmt(t.target); amt = fmt(r.delta[t.account], { sign: true }); break;
    }
    const when = opt.withDate ? C.fmtDateTime(t.time).slice(5) : C.fmtTime(t.time);
    const sub = opt.acc ? '<small>餘額 ' + fmt(r.after[opt.acc]) + '</small>' : '';
    const icStyle = (t.type === 'expense' || t.type === 'income') && !BUILTIN_COLOR[t.account] ? ' style="background:' + accColor(t.account) + '"' : '';
    return '<button class="tx" data-id="' + esc(t.id) + '"><span class="tx-ic ' + cls + '"' + icStyle + '>' + ic + '</span>' +
      '<span class="tx-main"><span class="tx-title"' + (t.type === 'expense' || t.type === 'income' || t.type === 'transfer' ? ' data-notr' : '') + '>' + esc(title) + '</span><span class="tx-meta">' + when + ' · ' + esc(meta) + (t.note ? ' · ' + esc(t.note) : '') + '</span></span>' +
      '<span class="tx-amt ' + amtCls + '">' + amt + sub + '</span></button>';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.tx[data-id]');
    if (b) openDetail(b.dataset.id);
  });

  /* ================= 路由 ================= */
  const VIEWS = ['home', 'entry', 'records', 'stats', 'settings'];
  let view = 'home';
  function route() {
    const h = location.hash.slice(1);
    view = VIEWS.includes(h) ? h : 'home';
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === view));
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  function go(v) { if (location.hash !== '#' + v) location.hash = v; else route(); }
  function refresh() { comp = C.compute(state); render(); }
  function render() {
    if (view === 'home') renderHome();
    else if (view === 'entry') renderEntry(true);
    else if (view === 'records') renderRecords();
    else if (view === 'stats') renderStats();
    else if (view === 'settings') renderSettings();
  }

  /* ================= 首頁 ================= */
  function renderHome() {
    const now = Date.now();
    const d = new Date();
    $('#home-date').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + WEEK[d.getDay()];
    $('#h-total').textContent = fmt(comp.total);
    $('#h-income').textContent = fmt(comp.income);
    $('#h-expense').textContent = fmt(comp.expense);
    $('#h-accounts').innerHTML = C.ACCOUNTS.map(a => {
      const v = comp.balances[a.id];
      const credit = a.kind === 'credit';
      return '<button class="acc" data-acc="' + a.id + '"><div class="an"><i class="dot" style="background:' + accColor(a.id) + '"></i><span' + (a.builtin ? '' : ' data-notr') + '>' + esc(a.name) + '</span>' + (credit ? '<em class="acc-tag">信用卡</em>' : '') + '</div>' +
        '<div class="av' + (v < 0 && !credit ? ' negv' : '') + '">' + fmt(v) + '</div>' + (credit && v < 0 ? '<div class="acc-sub">欠款 ' + fmt(-v) + '</div>' : '') + '</button>';
    }).join('');
    const t0 = C.startOfDay(now);
    const m0 = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const m1 = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    $('#h-today').textContent = fmt(C.stats(state, comp, t0, t0 + DAY).expense);
    $('#h-month').textContent = fmt(C.stats(state, comp, m0, m1).expense);
    const ch = comp.balances.change;
    const jb = $('#act-jar');
    jb.disabled = ch <= 0;
    jb.querySelector('span:last-child').textContent = ch > 0 ? '零錢 ' + fmt(ch) + ' 轉入零錢筒' : '將零錢全部轉入零錢筒（沒有零錢）';
    const scs = state.settings.shortcuts;
    $('#h-shortcuts').innerHTML = scs.map(sc => '<button class="sc-btn' + scCls(sc) + '" data-sc="' + esc(sc.id) + '"><b' + scNotr(sc) + '>' + esc(sc.name) + '</b><small>' + esc(accShort(sc.account)) + (sc.type === 'income' ? '收入' : '') + '</small>' + (sc.amount > 0 ? '<small>' + shortAmt(sc.amount) + '</small>' : '') + '</button>').join('') +
      '<button class="sc-btn add" data-sc-new><b>＋</b><small>新增捷徑</small></button>';
    const recent = comp.rows.slice(-6).reverse();
    $('#h-recent').innerHTML = recent.length ? recent.map(r => txRowHtml(r, { withDate: true })).join('') : '<div class="empty">尚未有紀錄。試試輸入「早餐25」。</div>';
  }
  $('#h-accounts').addEventListener('click', e => {
    const b = e.target.closest('[data-acc]');
    if (b) openAdjust(b.dataset.acc);
  });
  $('.actions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'entry') { go('entry'); }
    else if (a === 'income') { resetEntry(true); qe.income = true; go('entry'); }
    else if (a === 'expense') { resetEntry(true); qe.income = false; go('entry'); }
    else if (a === 'jar') openJar();
    else if (a === 'adjust') openAdjust('cash');
    else if (a === 'transfer') openTransfer();
  });

  /* ---------- 常用捷徑 ---------- */
  // 預設捷徑（未改名）可跟隨介面語言翻譯；使用者自訂的名稱不翻譯
  function scNotr(sc) { const d = C.DEFAULT_SHORTCUTS.find(x => x.id === sc.id); return d && d.name === sc.name ? '' : ' data-notr'; }
  function scCls(sc) { return (sc.type === 'income' ? ' inc' : '') + (sc.account !== 'cash' && sc.type !== 'income' ? ' ali' : ''); }
  function scMeta(sc) {
    const acc = accShort(sc.account);
    return (sc.type === 'income' ? acc + '收入' : acc) + (sc.amount > 0 ? ' · ' + shortAmt(sc.amount) : '');
  }
  function shortAmt(c) { return fmt(c).replace(/\.00$/, ''); }
  function applyShortcut(id) {
    const sc0 = state.settings.shortcuts.find(s => s.id === id);
    if (!sc0) return;
    // 捷徑所用的付款方式已被刪除時，改用現金
    const sc = C.ACC[sc0.account] ? sc0 : { ...sc0, account: 'cash' };
    // 有金額 + 已開啟「直接記賬」→ 一按即記
    if (state.settings.shortcutDirect && sc.amount > 0) {
      const f = sc.type === 'income'
        ? { type: 'income', account: sc.account, amount: sc.amount, item: sc.name }
        : { type: 'expense', account: sc.account, amount: sc.amount, change: 0, item: sc.name };
      addTx(f);
      return;
    }
    resetEntry(false);
    qe.income = sc.type === 'income';
    qe.account = sc.account;
    qe.main = sc.amount || 0;
    $('#e-item').value = sc.name;
    if (view !== 'entry') go('entry'); else renderEntry(true);
    toast(sc.amount > 0 ? '已填入「' + sc.name + '」，確認後按記賬' : '已選「' + sc.name + '」，請輸入金額');
  }
  function openShortcutEdit(id) {
    const list = state.settings.shortcuts;
    const sc = id ? list.find(s => s.id === id) : null;
    const cur = sc || { name: '', type: qe.income ? 'income' : 'expense', account: qe.account, amount: 0 };
    const seg = (name, opts, val) => '<div class="seg" data-seg="' + name + '">' + opts.map(([k, n]) => '<button type="button" data-v="' + k + '" class="' + (k === val ? 'on' : '') + '">' + n + '</button>').join('') + '</div>';
    openSheet(sc ? '編輯捷徑' : '新增捷徑',
      '<form class="form" id="sc-f" autocomplete="off">' +
      '<div><label class="field-label">名稱（即記賬項目）</label><input class="input" name="name" maxlength="20" placeholder="例如：午餐、買水、薪金" value="' + esc(cur.name) + '"></div>' +
      '<div><label class="field-label">類型</label>' + seg('type', [['expense', '支出'], ['income', '收入']], cur.type) + '</div>' +
      '<div><label class="field-label">帳戶／付款方式</label><select class="input" name="account">' + accOptions(C.ACC[cur.account] ? cur.account : 'cash', C.payable().map(a => a.id)) + '</select></div>' +
      '<div><label class="field-label">預設金額（可留空，留空則每次自行輸入）</label><input class="input" name="amount" inputmode="decimal" placeholder="例如 35" value="' + (cur.amount > 0 ? C.plain(cur.amount) : '') + '"></div>' +
      '<div class="form-actions">' + (sc ? '<button type="button" class="btn danger" id="sc-del">刪除</button>' : '<button type="button" class="btn" data-close>取消</button>') + '<button type="submit" class="btn primary">儲存</button></div></form>',
      body => {
        const f = body.querySelector('#sc-f');
        body.querySelectorAll('[data-seg]').forEach(sg => sg.addEventListener('click', e => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        }));
        const segVal = n => body.querySelector('[data-seg="' + n + '"] .on').dataset.v;
        if (!sc) setTimeout(() => f.name.focus(), 50);
        const del = body.querySelector('#sc-del');
        if (del) del.addEventListener('click', () => {
          if (!confirm('刪除捷徑「' + sc.name + '」？')) return;
          state.settings.shortcuts = list.filter(s => s.id !== sc.id);
          save(); closeSheet(); render(); toast('已刪除捷徑');
        });
        f.addEventListener('submit', e => {
          e.preventDefault();
          const name = f.name.value.trim();
          if (!name) { f.name.focus(); return; }
          const s = f.amount.value.trim();
          const amount = s === '' ? 0 : C.toCents(s);
          if (Number.isNaN(amount) || amount < 0) { alert('金額格式不正確'); return; }
          const data = { name, type: segVal('type'), account: f.account.value, amount };
          if (sc) Object.assign(sc, data);
          else list.push({ id: 'sc-' + uid(), ...data });
          save(); closeSheet(); render();
          toast(sc ? '已更新捷徑' : '已新增捷徑「' + name + '」');
        });
      });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sc]');
    if (b) { applyShortcut(b.dataset.sc); return; }
    if (e.target.closest('[data-sc-new]')) { openShortcutEdit(null); return; }
    if (e.target.closest('[data-goto-sc]')) {
      e.preventDefault();
      go('settings');
      setTimeout(() => { const el = $('#set-sc'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    }
  });

  /* ---------- 文字快速輸入 ---------- */
  function bindQuickText(form, preview) {
    const input = form.querySelector('input');
    const upd = () => {
      const r = C.parse(input.value);
      preview.className = 'qt-preview' + (r.ok ? ' ok' : r.error ? ' err' : '');
      preview.textContent = r.ok ? '✓ ' + describeWithBalance(r.tx) : (r.error || '');
    };
    input.addEventListener('input', upd);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const r = C.parse(input.value);
      if (!r.ok) { upd(); if (!r.error) input.focus(); return; }
      const tx = r.tx;
      if (tx.type === 'adjust' && tx.target === comp.balances[tx.account]) { toast(NAME[tx.account] + '餘額已經是 ' + fmt(tx.target)); return; }
      if (tx.type === 'transfer' && tx.amount > comp.balances[tx.from]) { alert(NAME[tx.from] + '餘額不足（目前 ' + fmt(comp.balances[tx.from]) + '），不可透支。'); return; }
      if (addTx(tx)) { input.value = ''; upd(); input.blur(); }
    });
  }
  function describeWithBalance(tx) {
    if (tx.type === 'adjust') {
      const cur = comp.balances[tx.account];
      return NAME[tx.account] + '：' + fmt(cur) + ' → ' + fmt(tx.target) + '（調整 ' + fmt(tx.target - cur, { sign: true }) + '）';
    }
    return C.describe(tx);
  }
  bindQuickText($('#home-qt'), $('#home-qt-preview'));
  bindQuickText($('#entry-qt'), $('#entry-qt-preview'));

  /* ================= 快速記賬 ================= */
  const qe = { account: 'cash', income: false, changeOn: false, active: 'main', main: 0, change: 0 };
  function resetEntry(full) {
    qe.main = 0; qe.change = 0; qe.changeOn = false; qe.active = 'main';
    if (full) { qe.account = 'cash'; qe.income = false; }
    const it = $('#e-item'); if (it) it.value = '';
  }
  let quickSig = '';
  function renderQuickGrid() {
    const qa = state.settings.quickAmounts;
    const sig = qa.join(',') + C.cur();
    if (sig === quickSig) return;
    quickSig = sig;
    $('#quick-grid').innerHTML = qa.map(c => '<button class="qbtn" data-c="' + c + '"><small>' + esc(C.cur()) + '</small>' + (c % 100 === 0 ? c / 100 : C.plain(c)) + '</button>').join('');
  }
  function modeInfo() {
    if (!C.ACC[qe.account]) qe.account = 'cash';
    const acc = qe.account;
    const kind = qe.income ? '收入' : '支出';
    const icon = qe.income ? '＋' : '−';
    if (acc === 'cash') return { cls: qe.income ? 'm-cash-inc' : 'm-cash-exp', text: '現金' + kind, icon };
    if (acc === 'alipay') return { cls: qe.income ? 'm-ali-inc' : 'm-ali-exp', text: 'Alipay（支付寶）' + kind, icon };
    return { cls: 'm-custom', color: accColor(acc), text: NAME[acc] + kind, icon };
  }
  function renderEntry(updateInputs) {
    renderQuickGrid();
    const m = modeInfo();
    const root = $('#view-entry');
    root.classList.remove('m-cash-exp', 'm-ali-exp', 'm-cash-inc', 'm-ali-inc', 'm-custom');
    root.classList.add(m.cls);
    root.style.setProperty('--mc', m.color || '');
    if (!m.color) root.style.removeProperty('--mc');
    // 付款方式選擇（有自訂付款方式時才顯示）
    const pay = C.payable();
    const accRow = $('#e-accounts');
    accRow.hidden = pay.length <= 2;
    accRow.innerHTML = pay.map(a => '<button class="chip acc-chip' + (a.id === qe.account ? ' on' : '') + '" data-pay="' + a.id + '" style="--ac:' + accColor(a.id) + '"><i class="dot" style="background:' + accColor(a.id) + '"></i><span' + (a.builtin ? '' : ' data-notr') + '>' + esc(a.short) + '</span></button>').join('');
    const bal = comp.balances;
    let sub = '餘額 ' + fmt(bal[qe.account]);
    if (qe.changeOn && !qe.income) sub += '<br>零錢 ' + fmt(bal.change);
    $('#mode-banner').innerHTML = '<span class="mb-icon">' + m.icon + '</span><span>' + m.text + '</span><span class="mb-sub">' + sub + '</span>';
    $$('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === state.settings.inputMode));

    $('#sp-a').setAttribute('aria-pressed', qe.account === 'alipay');
    $('#sp-plus').setAttribute('aria-pressed', qe.changeOn && !qe.income);
    $('#sp-plus').disabled = qe.income;
    $('#sp-inc').setAttribute('aria-pressed', qe.income);

    $('#amt-main-label').textContent = qe.income ? '收入金額' : accShort(qe.account);
    const showChange = qe.changeOn && !qe.income;
    $('#amt-change-row').hidden = !showChange;
    $('#amt-main-row').classList.toggle('active', !showChange || qe.active === 'main');
    $('#amt-change-row').classList.toggle('active', showChange && qe.active === 'change');
    if (updateInputs) {
      $('#amt-main').value = qe.main ? C.plain(qe.main) : '';
      $('#amt-change').value = qe.change ? C.plain(qe.change) : '';
    }
    const change = showChange ? qe.change : 0;
    const total = qe.main + change;
    let tot;
    if (qe.income) tot = '收入 <b>' + fmt(qe.main) + '</b>';
    else if (showChange) tot = esc(accShort(qe.account)) + ' ' + fmt(qe.main) + ' ＋ 零錢 ' + fmt(qe.change) + '　總支出 <b>' + fmt(total) + '</b>';
    else tot = '總支出 <b>' + fmt(total) + '</b>';
    $('#amt-total').innerHTML = tot;

    const hint = $('#amt-hint');
    hint.className = 'amt-hint'; hint.textContent = '';
    if (!qe.income && change > bal.change) { hint.className = 'amt-hint err'; hint.textContent = '⚠ 零錢不足（目前 ' + fmt(bal.change) + '），不可透支'; }
    else if (!qe.income && qe.main > bal[qe.account] && C.ACC[qe.account].kind !== 'credit') { hint.className = 'amt-hint warn'; hint.textContent = '⚠ ' + NAME[qe.account] + '餘額不足（目前 ' + fmt(bal[qe.account]) + '）'; }
    else if (showChange && qe.active === 'change') { hint.textContent = '正在輸入零錢金額，再按「＋」可取消零錢'; hint.className = 'amt-hint warn'; }

    const btn = $('#e-submit');
    btn.innerHTML = '記賬' + (total > 0 ? ' ' + fmt(total) : '') + '<small>' + m.text + '</small>';
    btn.disabled = total <= 0;

    // 常用捷徑
    $('#e-shortcuts').innerHTML = state.settings.shortcuts.map(sc => '<button class="chip sc-chip' + scCls(sc) + '" data-sc="' + esc(sc.id) + '">' + (sc.type === 'income' ? '＋' : '') + '<span' + scNotr(sc) + '>' + esc(sc.name) + '</span>' + (sc.amount > 0 ? '<span class="sc-amt">' + shortAmt(sc.amount) + '</span>' : '') + '</button>').join('') +
      '<button class="chip sc-chip add" data-sc-new>＋ 新增</button>';

    // 常用項目
    const freq = {};
    for (const t of state.txs.slice(-300)) if (t.type === 'expense' && t.item) freq[t.item] = (freq[t.item] || 0) + 1;
    const scNames = new Set(state.settings.shortcuts.map(s => s.name));
    const top = Object.keys(freq).filter(k => !scNames.has(k)).sort((a, b) => freq[b] - freq[a]).slice(0, 10);
    $('#e-recent').innerHTML = qe.income ? '' : top.map(s => '<button class="chip" data-notr data-item="' + esc(s) + '">' + esc(s) + '</button>').join('');
  }
  $('#quick-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = +b.dataset.c;
    const field = qe.changeOn && !qe.income && qe.active === 'change' ? 'change' : 'main';
    if (state.settings.inputMode === 'add') qe[field] += c; else qe[field] = c;
    renderEntry(true);
  });
  $('#sp-a').addEventListener('click', () => { qe.account = qe.account === 'alipay' ? 'cash' : 'alipay'; renderEntry(false); });
  $('#e-accounts').addEventListener('click', e => {
    const b = e.target.closest('[data-pay]');
    if (b) { qe.account = b.dataset.pay; renderEntry(false); }
  });
  $('#sp-plus').addEventListener('click', () => {
    if (qe.income) return;
    if (!qe.changeOn) { qe.changeOn = true; qe.active = 'change'; }
    else if (qe.active !== 'change') { qe.active = 'change'; }
    else { qe.changeOn = false; qe.change = 0; qe.active = 'main'; }
    renderEntry(true);
  });
  $('#sp-inc').addEventListener('click', () => {
    qe.income = !qe.income;
    if (qe.income) { qe.changeOn = false; qe.change = 0; qe.active = 'main'; }
    renderEntry(true);
  });
  $('#sp-clear').addEventListener('click', () => { resetEntry(false); renderEntry(true); });
  $('#mode-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    state.settings.inputMode = b.dataset.mode; save(); renderEntry(false);
  });
  $('#e-recent').addEventListener('click', e => {
    const b = e.target.closest('[data-item]');
    if (b) $('#e-item').value = b.dataset.item;
  });
  ['main', 'change'].forEach(f => {
    const inp = $('#amt-' + f);
    inp.addEventListener('focus', () => { qe.active = f; renderEntry(false); });
    inp.addEventListener('input', () => {
      const v = inp.value.trim() === '' ? 0 : C.toCents(inp.value);
      inp.style.color = Number.isNaN(v) ? 'var(--err)' : '';
      qe[f] = Number.isNaN(v) ? 0 : v;
      renderEntry(false);
    });
  });
  $('#amt-main-row').addEventListener('click', () => { if (qe.active !== 'main') { qe.active = 'main'; renderEntry(false); } });
  $('#amt-change-row').addEventListener('click', () => { if (qe.active !== 'change') { qe.active = 'change'; renderEntry(false); } });
  $('#e-item').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  $('#e-submit').addEventListener('click', () => {
    const item = $('#e-item').value.trim();
    let ok;
    if (qe.income) {
      if (!(qe.main > 0)) { toast('請輸入金額'); return; }
      ok = addTx({ type: 'income', account: qe.account, amount: qe.main, item: item || '收入' });
    } else {
      const change = qe.changeOn ? qe.change : 0;
      if (!(qe.main + change > 0)) { toast('請輸入金額'); return; }
      ok = addTx({ type: 'expense', account: qe.account, amount: qe.main, change, item: item || '其他' });
    }
    if (ok) { resetEntry(state.settings.resetAfter); renderEntry(true); }
  });

  /* ================= 零錢 → 零錢筒 ================= */
  function openJar() {
    const ch = comp.balances.change, jar = comp.balances.jar;
    if (ch <= 0) { toast('沒有零錢可轉'); return; }
    openSheet('將零錢全部轉入零錢筒',
      '<div class="form">' +
      '<dl class="kv"><dt>零錢目前餘額</dt><dd>' + fmt(ch) + '</dd><dt>預計轉帳金額</dt><dd><b>' + fmt(ch) + '</b></dd></dl>' +
      '<div class="card"><div class="label">零錢</div><div class="big-compare"><span class="num">' + fmt(ch) + '</span><span class="arrow">→</span><span class="num">' + fmt(0) + '</span></div></div>' +
      '<div class="card"><div class="label">零錢筒</div><div class="big-compare"><span class="num">' + fmt(jar) + '</span><span class="arrow">→</span><span class="num">' + fmt(jar + ch) + '</span></div></div>' +
      '<div class="notice ok">帳戶間轉帳：不計入收入或支出，總資產不變。</div>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn primary" id="jar-ok">確認轉入</button></div></div>',
      body => body.querySelector('#jar-ok').addEventListener('click', () => {
        const amt = comp.balances.change;
        if (amt <= 0) { closeSheet(); return; }
        if (addTx({ type: 'transfer', from: 'change', to: 'jar', amount: amt, item: '零錢轉入零錢筒' })) closeSheet();
      }));
  }

  /* ================= 調整餘額 ================= */
  function accOptions(sel, list) {
    return (list || C.ACC_IDS).map(id => '<option value="' + id + '"' + (id === sel ? ' selected' : '') + (C.ACC[id] && !C.ACC[id].builtin ? ' data-notr' : '') + '>' + esc(NAME[id]) + '</option>').join('');
  }
  const payIds = () => C.payable().map(a => a.id);
  // 可輸入負數的金額（信用卡欠款、初始餘額）
  function sCents(s) {
    s = String(s == null ? '' : s).trim();
    const neg = /^[-−]/.test(s);
    const v = C.toCents(s.replace(/^[-−]\s*/, ''));
    return neg ? -v : v;
  }
  function openAdjust(acc) {
    openSheet('調整帳戶餘額',
      '<div class="form">' +
      '<div><label class="field-label">帳戶</label><select class="input" id="adj-acc">' + accOptions(acc) + '</select></div>' +
      '<dl class="kv"><dt>目前餘額</dt><dd id="adj-cur"></dd></dl>' +
      '<div><label class="field-label" id="adj-lbl"></label><input class="input" id="adj-val" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>' +
      '<div class="notice warn" id="adj-diff">輸入新的餘額</div>' +
      '<div><label class="field-label">備註</label><input class="input" id="adj-note" placeholder="例如：核對錢包" autocomplete="off"></div>' +
      '<div class="label">調整不會計入累計收入或支出，會另外記錄調整金額，方便資產核對。</div>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn primary" id="adj-ok">確認調整</button></div></div>',
      body => {
        const accEl = body.querySelector('#adj-acc'), val = body.querySelector('#adj-val'), diff = body.querySelector('#adj-diff');
        // 信用卡：輸入「欠款」正數，內部以負數保存
        const isCredit = () => C.ACC[accEl.value] && C.ACC[accEl.value].kind === 'credit';
        const readV = () => { const v = sCents(val.value); return isCredit() ? -v : v; };
        const upd = () => {
          const cur = comp.balances[accEl.value];
          body.querySelector('#adj-lbl').textContent = isCredit() ? '目前欠款（' + C.cur() + '，輸入正數）' : '設定為（' + C.cur() + '）';
          body.querySelector('#adj-cur').textContent = fmt(cur);
          const v = readV();
          if (val.value.trim() === '') { diff.textContent = '輸入新的餘額'; diff.className = 'notice warn'; }
          else if (Number.isNaN(v)) { diff.textContent = '金額格式不正確'; diff.className = 'notice err'; }
          else { diff.textContent = fmt(cur) + ' → ' + fmt(v) + '（調整金額 ' + fmt(v - cur, { sign: true }) + '）'; diff.className = 'notice ok'; }
        };
        accEl.addEventListener('change', upd); val.addEventListener('input', upd); upd();
        body.querySelector('#adj-ok').addEventListener('click', () => {
          const v = readV();
          if (Number.isNaN(v) || val.value.trim() === '') { val.focus(); return; }
          if (v === comp.balances[accEl.value]) { toast('餘額沒有變化'); return; }
          if (addTx({ type: 'adjust', account: accEl.value, target: v, item: '餘額調整', note: body.querySelector('#adj-note').value.trim() })) closeSheet();
        });
      });
  }

  /* ================= 帳戶間轉帳 ================= */
  function openTransfer() {
    openSheet('帳戶間轉帳',
      '<div class="form">' +
      '<div class="row2"><div><label class="field-label">轉出</label><select class="input" id="tf-from">' + accOptions('cash') + '</select></div>' +
      '<div><label class="field-label">轉入</label><select class="input" id="tf-to">' + accOptions('change') + '</select></div></div>' +
      '<div><label class="field-label">金額（' + esc(C.cur()) + '）</label><input class="input" id="tf-amt" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>' +
      '<div class="label" id="tf-info"></div>' +
      '<div><label class="field-label">備註</label><input class="input" id="tf-note" autocomplete="off"></div>' +
      '<div class="notice ok">帳戶間轉帳不計入收入或支出，總資產不變。</div>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn primary" id="tf-ok">確認轉帳</button></div></div>',
      body => {
        const f = body.querySelector('#tf-from'), t = body.querySelector('#tf-to'), a = body.querySelector('#tf-amt');
        const upd = () => { body.querySelector('#tf-info').textContent = NAME[f.value] + '餘額 ' + fmt(comp.balances[f.value]) + '　' + NAME[t.value] + '餘額 ' + fmt(comp.balances[t.value]); };
        f.addEventListener('change', upd); t.addEventListener('change', upd); upd();
        body.querySelector('#tf-ok').addEventListener('click', () => {
          const amt = C.toCents(a.value);
          if (f.value === t.value) { alert('轉出及轉入帳戶不能相同'); return; }
          if (!(amt > 0)) { a.focus(); return; }
          if (amt > comp.balances[f.value]) { alert(NAME[f.value] + '餘額不足（目前 ' + fmt(comp.balances[f.value]) + '），不可透支。'); return; }
          const item = f.value === 'change' && t.value === 'jar' ? '零錢轉入零錢筒' : '帳戶轉帳';
          if (addTx({ type: 'transfer', from: f.value, to: t.value, amount: amt, item, note: body.querySelector('#tf-note').value.trim() })) closeSheet();
        });
      });
  }

  /* ================= 交易詳情 / 編輯 ================= */
  function openDetail(id) {
    const r = comp.byId[id];
    if (!r) return;
    const t = r.tx;
    let kv = '<dt>交易編號</dt><dd>#' + t.no + '</dd><dt>日期時間</dt><dd>' + C.fmtDateTime(t.time) + '</dd><dt>交易類型</dt><dd>' + C.TYPE_NAME[t.type] + '</dd><dt>項目</dt><dd>' + esc(t.item || '—') + '</dd>';
    if (t.type === 'expense') {
      kv += '<dt>總支出</dt><dd><b>' + fmt(C.txTotal(t)) + '</b></dd><dt>支付帳戶</dt><dd>' + esc(t.amount > 0 ? NAME[t.account] : '零錢') + '</dd>';
      kv += '<dt>支付拆分</dt><dd>' + (t.change > 0 ? (t.amount > 0 ? esc(NAME[t.account]) + ' ' + fmt(t.amount) + '<br>' : '') + '零錢 ' + fmt(t.change) : esc(NAME[t.account]) + ' ' + fmt(t.amount)) + '</dd>';
    } else if (t.type === 'income') {
      kv += '<dt>收入金額</dt><dd><b>' + fmt(t.amount) + '</b></dd><dt>收入帳戶</dt><dd>' + esc(NAME[t.account]) + '</dd>';
    } else if (t.type === 'transfer') {
      kv += '<dt>金額</dt><dd><b>' + fmt(t.amount) + '</b></dd><dt>轉出</dt><dd>' + esc(NAME[t.from]) + '</dd><dt>轉入</dt><dd>' + esc(NAME[t.to]) + '</dd>';
    } else {
      kv += '<dt>帳戶</dt><dd>' + esc(NAME[t.account]) + '</dd><dt>調整前餘額</dt><dd>' + fmt(r.before[t.account]) + '</dd><dt>調整後餘額</dt><dd>' + fmt(r.after[t.account]) + '</dd><dt>調整金額</dt><dd><b>' + fmt(r.delta[t.account], { sign: true }) + '</b></dd>';
    }
    kv += '<dt>備註</dt><dd>' + esc(t.note || '—') + '</dd>';
    const tbl = '<table class="bal-table"><thead><tr><th>帳戶</th><th>交易前</th><th>交易後</th><th>變化</th></tr></thead><tbody>' +
      C.ACCOUNTS.map(a => '<tr class="' + (r.delta[a.id] ? 'hl' : '') + '"><td>' + esc(a.name) + '</td><td>' + fmt(r.before[a.id]) + '</td><td>' + fmt(r.after[a.id]) + '</td><td>' + (r.delta[a.id] ? fmt(r.delta[a.id], { sign: true }) : '—') + '</td></tr>').join('') +
      '<tr class="hl"><td>總資產</td><td>' + fmt(r.totalBefore) + '</td><td>' + fmt(r.totalAfter) + '</td><td>' + (r.totalAfter - r.totalBefore ? fmt(r.totalAfter - r.totalBefore, { sign: true }) : '—') + '</td></tr></tbody></table>';
    openSheet(C.TYPE_NAME[t.type] + '詳情',
      '<div class="form"><dl class="kv">' + kv + '</dl>' + tbl +
      '<div class="form-actions"><button class="btn danger" id="d-del">刪除 / 撤銷此交易</button><button class="btn primary" id="d-edit">編輯</button></div></div>',
      body => {
        body.querySelector('#d-edit').addEventListener('click', () => openEdit(id));
        body.querySelector('#d-del').addEventListener('click', () => {
          if (!confirm('確定刪除這筆交易？\n' + C.describe(t) + '\n\n刪除後所有餘額及統計會自動重新計算。')) return;
          if (apply(state.txs.filter(x => x.id !== id), null, '已刪除：' + C.describe(t))) closeSheet();
        });
      });
  }

  const pad = n => String(n).padStart(2, '0');
  function toLocalInput(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fromLocalInput(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
  }
  function parseDateInput(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
  }
  function dateInput(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function openEdit(id) {
    const r = id ? comp.byId[id] : null;
    const t = r ? r.tx : { type: 'expense', time: Date.now(), item: '', account: 'cash', amount: 0, change: 0, note: '' };
    const v = c => c ? C.plain(c) : '';
    const typeOpts = ['expense', 'income', 'transfer', 'adjust'].map(k => '<option value="' + k + '"' + (k === t.type ? ' selected' : '') + '>' + C.TYPE_NAME[k] + '</option>').join('');
    openSheet(id ? '編輯交易 #' + t.no : '詳細記賬',
      '<form class="form" id="ed" autocomplete="off">' +
      '<div class="row2"><div><label class="field-label">類型</label><select class="input" name="type">' + typeOpts + '</select></div>' +
      '<div><label class="field-label">日期時間</label><input class="input" type="datetime-local" name="time" value="' + toLocalInput(t.time) + '"></div></div>' +
      '<div data-g="expense income transfer"><label class="field-label">項目</label><input class="input" name="item" value="' + esc(t.item) + '"></div>' +
      '<div data-g="expense" class="row2"><div><label class="field-label">支付帳戶</label><select class="input" name="eacc">' + accOptions(t.type === 'expense' ? t.account : 'cash', payIds()) + '</select></div>' +
      '<div><label class="field-label">金額</label><input class="input" name="eamt" inputmode="decimal" value="' + v(t.type === 'expense' ? t.amount : 0) + '"></div></div>' +
      '<div data-g="expense"><label class="field-label">零錢支付金額（可留空）</label><input class="input" name="echange" inputmode="decimal" value="' + v(t.type === 'expense' ? t.change : 0) + '"></div>' +
      '<div data-g="income" class="row2"><div><label class="field-label">收入帳戶</label><select class="input" name="iacc">' + accOptions(t.type === 'income' ? t.account : 'cash', payIds()) + '</select></div>' +
      '<div><label class="field-label">金額</label><input class="input" name="iamt" inputmode="decimal" value="' + v(t.type === 'income' ? t.amount : 0) + '"></div></div>' +
      '<div data-g="transfer" class="row2"><div><label class="field-label">轉出</label><select class="input" name="tfrom">' + accOptions(t.type === 'transfer' ? t.from : 'change') + '</select></div>' +
      '<div><label class="field-label">轉入</label><select class="input" name="tto">' + accOptions(t.type === 'transfer' ? t.to : 'jar') + '</select></div></div>' +
      '<div data-g="transfer"><label class="field-label">金額</label><input class="input" name="tamt" inputmode="decimal" value="' + v(t.type === 'transfer' ? t.amount : 0) + '"></div>' +
      '<div data-g="adjust" class="row2"><div><label class="field-label">帳戶</label><select class="input" name="aacc">' + accOptions(t.type === 'adjust' ? t.account : 'cash') + '</select></div>' +
      '<div><label class="field-label">設定為</label><input class="input" name="atarget" inputmode="decimal" value="' + (t.type === 'adjust' ? C.plain(t.target) : '') + '"></div></div>' +
      '<div><label class="field-label">備註</label><input class="input" name="note" value="' + esc(t.note) + '"></div>' +
      '<div class="label">儲存後，所有帳戶餘額及累計收支會自動重新計算。</div>' +
      '<div class="form-actions"><button type="button" class="btn" data-close>取消</button><button type="submit" class="btn primary">儲存</button></div></form>',
      body => {
        const f = body.querySelector('#ed');
        const showGroups = () => body.querySelectorAll('[data-g]').forEach(el => { el.hidden = !el.dataset.g.split(' ').includes(f.type.value); });
        f.type.addEventListener('change', showGroups); showGroups();
        f.addEventListener('submit', e => {
          e.preventDefault();
          const type = f.type.value;
          let time = fromLocalInput(f.time.value);
          if (Number.isNaN(time)) { alert('請輸入日期時間'); return; }
          if (r && f.time.value === toLocalInput(t.time)) time = t.time; // 未改時間則保留原始秒數
          const base = { type, time, item: f.item.value.trim(), note: f.note.value.trim() };
          const amt = name => { const s = f[name].value.trim(); return s === '' ? 0 : C.toCents(s); };
          let tx;
          if (type === 'expense') {
            const a = amt('eamt'), c = amt('echange');
            if (Number.isNaN(a) || Number.isNaN(c) || a + c <= 0) { alert('請輸入正確金額'); return; }
            tx = { ...base, account: f.eacc.value, amount: a, change: c, item: base.item || '其他' };
          } else if (type === 'income') {
            const a = amt('iamt');
            if (!(a > 0)) { alert('請輸入正確金額'); return; }
            tx = { ...base, account: f.iacc.value, amount: a, item: base.item || '收入' };
          } else if (type === 'transfer') {
            const a = amt('tamt');
            if (!(a > 0)) { alert('請輸入正確金額'); return; }
            if (f.tfrom.value === f.tto.value) { alert('轉出及轉入帳戶不能相同'); return; }
            tx = { ...base, from: f.tfrom.value, to: f.tto.value, amount: a, item: base.item || '帳戶轉帳' };
          } else {
            const s = f.atarget.value.trim();
            const a = C.toCents(s);
            if (s === '' || Number.isNaN(a)) { alert('請輸入正確金額'); return; }
            tx = { ...base, account: f.aacc.value, target: a, item: '餘額調整' };
          }
          let list, txId, label;
          if (r) {
            const nt = clean({ id: t.id, no: t.no, createdAt: t.createdAt, ...tx, updatedAt: Date.now() });
            list = state.txs.map(x => x.id === t.id ? nt : x);
            txId = t.id; label = '已修改：' + C.describe(nt);
          } else {
            const nt = clean(newTx(tx));
            list = [...state.txs, nt]; txId = nt.id; label = '已記賬：' + C.describe(nt);
          }
          if (apply(list, txId, label)) closeSheet();
          else if (!r) state.seq -= 1;
        });
      });
  }

  /* ================= 交易紀錄 ================= */
  const rf = { range: 'all', from: '', to: '', acc: '', type: '', limit: 300 };
  function rangeOf(key, fromStr, toStr) {
    const now = new Date();
    const t0 = C.startOfDay(now);
    switch (key) {
      case 'today': return [t0, t0 + DAY];
      case 'week': { const dow = (now.getDay() + 6) % 7; return [t0 - dow * DAY, t0 + DAY]; }
      case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()];
      case 'lastmonth': return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()];
      case '7d': return [t0 - 6 * DAY, t0 + DAY];
      case '30d': return [t0 - 29 * DAY, t0 + DAY];
      case 'year': return [new Date(now.getFullYear(), 0, 1).getTime(), new Date(now.getFullYear() + 1, 0, 1).getTime()];
      case 'custom': {
        const f = parseDateInput(fromStr), t = parseDateInput(toStr);
        return [Number.isNaN(f) ? 0 : f, Number.isNaN(t) ? Infinity : t + DAY];
      }
      default: return [0, Infinity];
    }
  }
  function renderRecords() {
    if (rf.acc && !C.ACC[rf.acc]) rf.acc = '';
    $('#r-acc').innerHTML = '<option value="">全部帳戶</option>' + accOptions(rf.acc);
    $('#r-acc').value = rf.acc;
    $$('#r-range button').forEach(b => b.classList.toggle('on', b.dataset.r === rf.range));
    $('#r-custom').hidden = rf.range !== 'custom';
    $('#r-undo').disabled = !undoStack.length;
    const [from, to] = rangeOf(rf.range, rf.from, rf.to);
    const rows = comp.rows.filter(r => r.tx.time >= from && r.tx.time < to && (!rf.type || r.tx.type === rf.type) && (!rf.acc || C.involves(r.tx, rf.acc)));
    let inc = 0, exp = 0;
    rows.forEach(r => { if (r.tx.type === 'income') inc += r.tx.amount; else if (r.tx.type === 'expense') exp += C.txTotal(r.tx); });
    $('#r-summary').innerHTML = '<span>共 <b>' + rows.length + '</b> 筆</span><span>收入 <b class="pos">' + fmt(inc) + '</b></span><span>支出 <b class="neg">' + fmt(exp) + '</b></span>' +
      (rf.acc ? '<span>' + esc(NAME[rf.acc]) + '目前餘額 <b>' + fmt(comp.balances[rf.acc]) + '</b></span>' : '');
    if (!rows.length) { $('#r-list').innerHTML = '<div class="card"><div class="empty">沒有符合條件的紀錄</div></div>'; return; }
    const list = rows.slice().reverse().slice(0, rf.limit);
    const groups = [];
    let cur = null;
    for (const r of list) {
      const k = C.dayKey(r.tx.time);
      if (!cur || cur.k !== k) { cur = { k, t: r.tx.time, rows: [], exp: 0 }; groups.push(cur); }
      cur.rows.push(r);
      if (r.tx.type === 'expense') cur.exp += C.txTotal(r.tx);
    }
    $('#r-list').innerHTML = groups.map(g => '<div class="day-group"><div class="day-head"><span>' + dayLabel(g.t) + '</span><span>' + (g.exp ? '支出 ' + fmt(g.exp) : '') + '</span></div><div class="card tx-list">' +
      g.rows.map(r => txRowHtml(r, { acc: rf.acc })).join('') + '</div></div>').join('') +
      (rows.length > rf.limit ? '<button class="btn" id="r-more" style="width:100%">顯示更多（尚有 ' + (rows.length - rf.limit) + ' 筆）</button>' : '');
    const more = $('#r-more');
    if (more) more.addEventListener('click', () => { rf.limit += 300; renderRecords(); });
  }
  $('#r-range').addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rf.range = b.dataset.r; rf.limit = 300;
    if (rf.range === 'custom' && !rf.from) { rf.from = dateInput(Date.now() - 6 * DAY); rf.to = dateInput(Date.now()); $('#r-from').value = rf.from; $('#r-to').value = rf.to; }
    renderRecords();
  });
  $('#r-from').addEventListener('change', e => { rf.from = e.target.value; renderRecords(); });
  $('#r-to').addEventListener('change', e => { rf.to = e.target.value; renderRecords(); });
  $('#r-acc').addEventListener('change', e => { rf.acc = e.target.value; renderRecords(); });
  $('#r-type').addEventListener('change', e => { rf.type = e.target.value; renderRecords(); });
  $('#r-undo').addEventListener('click', undo);
  $('#r-new').addEventListener('click', () => openEdit(null));

  /* ================= 統計 ================= */
  const sf = { range: 'month', from: '', to: '' };
  const charts = {};
  function niceMax(v) {
    if (v <= 0) return 1000;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  function barPath(x, y, w, h) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  /* 柱狀圖：cats = [{label, tip}], series = [{name, cls, color, values}] */
  function barChart(el, id, cats, series) {
    const W = Math.max(260, el.clientWidth), H = 190;
    const pl = 46, pr = 6, pt = 10, pb = 24;
    const iw = W - pl - pr, ih = H - pt - pb;
    const n = cats.length;
    const max = niceMax(Math.max(0, ...series.flatMap(s => s.values)));
    const gw = iw / Math.max(1, n);
    const bw = Math.max(2, Math.min(26, (gw * 0.72 - (series.length - 1) * 2) / series.length));
    let s = '<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" data-chart="' + id + '" role="img">';
    for (let i = 0; i <= 2; i++) {
      const y = pt + ih - ih * i / 2;
      s += '<line class="gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text class="axl" x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + C.shortNum(max * i / 2) + '</text>';
    }
    const every = Math.ceil(n / Math.max(1, Math.floor(iw / 44)));
    cats.forEach((c, i) => {
      const gx = pl + gw * i;
      const totalW = bw * series.length + 2 * (series.length - 1);
      let x = gx + (gw - totalW) / 2;
      s += '<rect class="hov" data-hov="' + i + '" x="' + gx + '" y="' + pt + '" width="' + gw + '" height="' + ih + '" visibility="hidden"/>';
      series.forEach(se => {
        const h = Math.round(ih * se.values[i] / max);
        s += '<path class="' + se.cls + '" d="' + barPath(x, pt + ih - h, bw, h) + '"/>';
        x += bw + 2;
      });
      if (i % every === 0) s += '<text class="axl" x="' + (gx + gw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(c.label) + '</text>';
      s += '<rect class="hit" data-i="' + i + '" x="' + gx + '" y="0" width="' + gw + '" height="' + H + '"/>';
    });
    s += '</svg>';
    el.innerHTML = s;
    charts[id] = { cats, series };
  }
  function showTip(svg, i, ev) {
    const ch = charts[svg.dataset.chart];
    if (!ch) return;
    svg.querySelectorAll('.hov').forEach(h => h.setAttribute('visibility', h.dataset.hov == i ? 'visible' : 'hidden'));
    const tip = $('#tip');
    tip.innerHTML = '<b>' + esc(ch.cats[i].tip) + '</b><br>' + ch.series.map(se => '<i style="background:' + se.color + '"></i>' + esc(se.name) + ' ' + fmt(se.values[i])).join('<br>');
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX + 12, y = ev.clientY - th - 12;
    if (x + tw > window.innerWidth - 8) x = ev.clientX - tw - 12;
    if (y < 8) y = ev.clientY + 16;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() {
    $('#tip').hidden = true;
    $$('.chart .hov').forEach(h => h.setAttribute('visibility', 'hidden'));
  }
  $('#s-body').addEventListener('pointermove', e => {
    const hit = e.target.closest('.hit');
    if (hit) showTip(hit.closest('svg'), +hit.dataset.i, e); else hideTip();
  });
  $('#s-body').addEventListener('pointerdown', e => {
    const hit = e.target.closest('.hit');
    if (hit) showTip(hit.closest('svg'), +hit.dataset.i, e); else hideTip();
  });
  $('#s-body').addEventListener('pointerleave', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true });

  function renderStats() {
    hideTip();
    $$('#s-range button').forEach(b => b.classList.toggle('on', b.dataset.r === sf.range));
    $('#s-custom').hidden = sf.range !== 'custom';
    const [from, to] = rangeOf(sf.range, sf.from, sf.to);
    const st = C.stats(state, comp, from, to);
    // 圖表顯示範圍（不超過今日）
    const firstT = comp.rows.length ? comp.rows[0].tx.time : Date.now();
    const vFrom = C.startOfDay(from === 0 ? firstT : from);
    const tomorrow = C.startOfDay(Date.now()) + DAY;
    const vTo = Math.max(vFrom + DAY, Math.min(to, tomorrow));
    const days = Math.max(1, Math.round((vTo - vFrom) / DAY));
    const net = st.income - st.expense;

    const cats = Object.entries(st.cats).sort((a, b) => b[1] - a[1]);
    let catList = cats.slice(0, 10);
    if (cats.length > 10) catList.push(['其他項目', cats.slice(10).reduce((s, x) => s + x[1], 0)]);
    const catMax = catList.length ? catList[0][1] : 1;

    const accTbl = '<table class="bal-table"><thead><tr><th>帳戶</th><th>期初</th><th>期末</th><th>變化</th></tr></thead><tbody>' +
      C.ACCOUNTS.map(a => { const d = st.endBal[a.id] - st.startBal[a.id]; return '<tr><td>' + esc(a.name) + '</td><td>' + fmt(st.startBal[a.id]) + '</td><td>' + fmt(st.endBal[a.id]) + '</td><td class="' + (d > 0 ? 'pos' : d < 0 ? 'neg' : '') + '">' + (d ? fmt(d, { sign: true }) : '—') + '</td></tr>'; }).join('') +
      (() => { const s0 = C.ACC_IDS.reduce((s, k) => s + st.startBal[k], 0), s1 = C.ACC_IDS.reduce((s, k) => s + st.endBal[k], 0); return '<tr class="hl"><td>總資產</td><td>' + fmt(s0) + '</td><td>' + fmt(s1) + '</td><td>' + (s1 - s0 ? fmt(s1 - s0, { sign: true }) : '—') + '</td></tr>'; })() +
      '</tbody></table>';

    const rec = comp.reconciled;
    const recon = '<dl class="kv"><dt>初始總資產</dt><dd>' + fmt(comp.initialTotal) + '</dd><dt>＋ 累計收入</dt><dd class="pos">' + fmt(comp.income) + '</dd><dt>− 累計支出</dt><dd class="neg">' + fmt(comp.expense) + '</dd>' +
      '<dt>± 手動調整淨額</dt><dd>' + fmt(comp.adjust, { sign: true }) + '</dd><dt>＝ 應有總資產</dt><dd><b>' + fmt(comp.expected) + '</b></dd><dt>實際總資產</dt><dd><b>' + fmt(comp.total) + '</b></dd></dl>' +
      '<div class="notice ' + (rec ? 'ok' : 'err') + '" style="margin-top:10px">' + (rec ? '✓ 核對一致' : '✗ 核對不一致，請檢查資料') + '</div>';

    $('#s-body').innerHTML =
      '<div class="s-cards">' +
      '<div class="card mini"><div class="label">收入</div><div class="num pos">' + fmt(st.income) + '</div></div>' +
      '<div class="card mini"><div class="label">支出</div><div class="num neg">' + fmt(st.expense) + '</div></div>' +
      '<div class="card mini"><div class="label">淨額（收入 − 支出）</div><div class="num">' + fmt(net, { sign: true }) + '</div></div>' +
      '<div class="card mini"><div class="label">日均支出（' + days + ' 日）</div><div class="num">' + fmt(Math.round(st.expense / days)) + '</div></div></div>' +
      '<div class="s-grid"><div>' +
      '<div class="card"><div class="card-title" id="c1-title"></div><div id="c1"></div><details class="tbl"><summary>以表格顯示</summary><div id="c1-tbl"></div></details></div>' +
      '<div class="card"><div class="card-title">收入與支出（按月）</div><div class="legend"><span><i style="background:var(--series-inc)"></i>收入</span><span><i style="background:var(--series-exp)"></i>支出</span></div><div id="c2"></div><details class="tbl"><summary>以表格顯示</summary><div id="c2-tbl"></div></details></div>' +
      '</div><div>' +
      '<div class="card"><div class="card-title">支出分類（按項目）</div>' + (catList.length ? catList.map(([k, v]) => '<div class="cat-row"><span class="cat-name" data-notr>' + esc(k) + '</span><span><div class="cat-bar" style="width:' + Math.max(1, v / catMax * 100) + '%"></div></span><span class="cat-val">' + fmt(v) + '<small>' + Math.round(v / st.expense * 100) + '%</small></span></div>').join('') : '<div class="empty">此期間沒有支出</div>') + '</div>' +
      '<div class="card"><div class="card-title">各帳戶資金變化</div>' + accTbl + '</div>' +
      '<div class="card"><div class="card-title">資產核對（全部紀錄）</div>' + recon + '</div>' +
      '</div></div>';

    // 圖表一：每日支出（>62 日改為每月）
    const c1 = [];
    if (days <= 62) {
      $('#c1-title').textContent = '每日支出';
      for (let t = vFrom; t < vFrom + days * DAY; t = C.startOfDay(t + DAY + 3600000)) {
        const d = new Date(t);
        c1.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), tip: dayLabel(t), v: st.daily[C.dayKey(t)] || 0 });
      }
    } else {
      $('#c1-title').textContent = '每月支出';
      monthsBetween(vFrom, vTo).forEach(m => c1.push({ label: m.label, tip: m.tip, v: st.monthlyExp[m.key] || 0 }));
    }
    barChart($('#c1'), 'c1', c1, [{ name: '支出', cls: 'bar-exp', color: 'var(--series-exp)', values: c1.map(x => x.v) }]);
    $('#c1-tbl').innerHTML = tableOf(['日期', '支出'], c1.filter(x => x.v).map(x => [x.tip, fmt(x.v)]));

    // 圖表二：每月收入與支出
    let months = monthsBetween(vFrom, vTo);
    if (months.length > 24) months = months.slice(-24);
    const inc = months.map(m => st.monthlyInc[m.key] || 0), exp = months.map(m => st.monthlyExp[m.key] || 0);
    barChart($('#c2'), 'c2', months.map(m => ({ label: m.label, tip: m.tip })), [
      { name: '收入', cls: 'bar-inc', color: 'var(--series-inc)', values: inc },
      { name: '支出', cls: 'bar-exp', color: 'var(--series-exp)', values: exp },
    ]);
    $('#c2-tbl').innerHTML = tableOf(['月份', '收入', '支出'], months.map((m, i) => [m.tip, fmt(inc[i]), fmt(exp[i])]));
  }
  function monthsBetween(from, to) {
    const out = [];
    const d = new Date(from); d.setDate(1); d.setHours(0, 0, 0, 0);
    const multiYear = new Date(from).getFullYear() !== new Date(to - 1).getFullYear();
    while (d.getTime() < to && out.length < 240) {
      const y = d.getFullYear(), m = d.getMonth() + 1;
      out.push({ key: y + '-' + pad(m), label: multiYear ? (String(y).slice(2) + '/' + m) : m + '月', tip: y + '年' + m + '月' });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  function tableOf(head, rows) {
    if (!rows.length) return '<div class="empty">沒有資料</div>';
    return '<table class="bal-table"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  $('#s-range').addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    sf.range = b.dataset.r;
    if (sf.range === 'custom' && !sf.from) {
      const d = new Date();
      sf.from = dateInput(new Date(d.getFullYear(), d.getMonth(), 1)); sf.to = dateInput(Date.now());
      $('#s-from').value = sf.from; $('#s-to').value = sf.to;
    }
    renderStats();
  });
  $('#s-from').addEventListener('change', e => { sf.from = e.target.value; renderStats(); });
  $('#s-to').addEventListener('change', e => { sf.to = e.target.value; renderStats(); });
  let rsT = null;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => { if (view === 'stats' && window.innerWidth !== lastW) { lastW = window.innerWidth; renderStats(); } }, 150);
  });

  /* ================= 設定 ================= */
  function renderSettings() {
    const s = state.settings;
    const qa = s.quickAmounts;
    const persisted = renderSettings.persisted;
    $('#set-body').innerHTML =
      '<div class="home-grid"><div class="col">' +
      '<div class="set-section"><h3>快捷金額</h3><div class="card">' +
      qa.map((c, i) => '<div class="qa-item"><input class="input" inputmode="decimal" data-qi="' + i + '" value="' + C.plain(c) + '" aria-label="快捷金額 ' + (i + 1) + '">' +
        '<button class="icon-btn" data-up="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="上移">↑</button>' +
        '<button class="icon-btn" data-down="' + i + '"' + (i === qa.length - 1 ? ' disabled' : '') + ' aria-label="下移">↓</button>' +
        '<button class="icon-btn del" data-del="' + i + '" aria-label="刪除">✕</button></div>').join('') +
      '<div class="qa-item"><input class="input" inputmode="decimal" id="qa-new" placeholder="新增金額，例如 3.5"><button class="btn small primary" id="qa-add">新增</button></div>' +
      '<div class="set-row"><span class="sr-l">恢復預設快捷金額<div class="sr-d">100、50、20、10、5、2、1、0.50</div></span><button class="btn small" id="qa-reset">恢復預設</button></div>' +
      '</div></div>' +
      '<div class="set-section" id="set-sc"><h3>常用捷徑（支出／收入）</h3><div class="card">' +
      (s.shortcuts.length ? '' : '<div class="empty">尚未設定捷徑</div>') +
      s.shortcuts.map((sc, i) => '<div class="qa-item"><button class="sc-row" data-sc-edit="' + esc(sc.id) + '"><span class="sc-tag ' + (sc.type === 'income' ? 'inc' : 'exp') + '">' + (sc.type === 'income' ? '收入' : '支出') + '</span><b' + scNotr(sc) + '>' + esc(sc.name) + '</b><small>' + esc(scMeta(sc)) + '</small></button>' +
        '<button class="icon-btn" data-sc-up="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="上移">↑</button>' +
        '<button class="icon-btn" data-sc-down="' + i + '"' + (i === s.shortcuts.length - 1 ? ' disabled' : '') + ' aria-label="下移">↓</button>' +
        '<button class="icon-btn del" data-sc-del="' + i + '" aria-label="刪除">✕</button></div>').join('') +
      '<div class="btn-col" style="margin-top:10px"><button class="btn primary" data-sc-new>＋ 新增捷徑</button></div>' +
      '<div class="set-row"><span class="sr-l">點擊捷徑直接記賬<div class="sr-d">只適用於有預設金額的捷徑；關閉時會先填入記賬頁讓你確認</div></span><label class="switch"><input type="checkbox" id="set-scdirect"' + (s.shortcutDirect ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="set-row"><span class="sr-l">恢復預設捷徑<div class="sr-d">早餐、午餐、晚餐、買水、交通、零用錢、薪金</div></span><button class="btn small" id="sc-reset">恢復預設</button></div>' +
      '</div></div>' +
      '<div class="set-section"><h3>記賬</h3><div class="card">' +
      '<div class="set-row"><span class="sr-l">金額輸入模式<div class="sr-d">累加：20+10+5=35；直接設定：按 20 即 20</div></span><div class="seg" id="set-mode"><button data-mode="add" class="' + (s.inputMode === 'add' ? 'on' : '') + '">累加</button><button data-mode="set" class="' + (s.inputMode === 'set' ? 'on' : '') + '">直接設定</button></div></div>' +
      '<div class="set-row"><span class="sr-l">記賬後重設為「現金支出」<div class="sr-d">關閉後會保留 A／收入模式</div></span><label class="switch"><input type="checkbox" id="set-reset"' + (s.resetAfter ? ' checked' : '') + '><span></span></label></div>' +
      '</div></div>' +
      '<div class="set-section"><h3>外觀</h3><div class="card"><div class="set-row"><span>深色／淺色模式</span><div class="seg" id="set-theme">' +
      [['auto', '自動'], ['light', '淺色'], ['dark', '深色']].map(([k, n]) => '<button data-theme="' + k + '" class="' + (s.theme === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div></div></div></div>' +
      '<div class="set-section"><h3>語言及貨幣</h3><div class="card">' +
      '<div class="set-row"><span class="sr-l">語言 / Language</span><div class="seg" id="set-lang">' +
      [['zh-Hant', '繁體'], ['zh-Hans', '简体'], ['en', 'English']].map(([k, n]) => '<button data-lang="' + k + '" data-notr class="' + (s.lang === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div></div>' +
      '<div class="set-row"><span class="sr-l">貨幣<div class="sr-d">只改變顯示的貨幣符號，不會換算金額</div></span><select class="input" id="set-cur" style="width:auto">' +
      C.CURRENCIES.map(c => '<option value="' + c.code + '"' + (c.code === s.currency ? ' selected' : '') + '>' + c.sym + ' ' + c.name + '</option>').join('') + '</select></div>' +
      '</div></div>' +
      '</div><div class="col">' +
      '<div class="set-section"><h3>資料備份及恢復</h3><div class="card">' +
      '<div class="btn-col"><button class="btn primary" id="ex-json">匯出 JSON 備份（可用於恢復）</button><button class="btn" id="ex-csv">匯出 CSV（Excel／Numbers）</button><button class="btn" id="im-json">從 JSON 備份匯入及恢復</button></div>' +
      '<input type="file" id="im-file" accept=".json,application/json" hidden>' +
      '<div class="set-row"><span class="sr-l">上次匯出備份</span><span class="label">' + (state.meta.lastExport ? C.fmtDateTime(state.meta.lastExport) : '從未') + '</span></div>' +
      '<div class="set-row"><span class="sr-l">持久儲存<div class="sr-d">資料保存在本機（此瀏覽器／主畫面 App）</div></span><span class="label">' + (persisted === true ? '✓ 已啟用' : persisted === false ? '未獲授權' : '—') + '</span></div>' +
      '</div></div>' +
      '<div class="set-section" id="set-acc"><h3>付款方式／帳戶</h3><div class="card">' +
      C.ACCOUNTS.map(a => a.builtin
        ? '<div class="set-row"><span class="sr-l"><i class="dot" style="background:' + accColor(a.id) + '"></i> ' + esc(a.name) + '</span><span class="label">內建</span></div>'
        : '<div class="qa-item"><button class="sc-row" data-acc-edit="' + esc(a.id) + '"><i class="dot" style="background:' + accColor(a.id) + '"></i><b data-notr>' + esc(a.name) + '</b><small>' + (a.kind === 'credit' ? '信用卡' : '一般帳戶') + ' · ' + fmt(comp.balances[a.id] || 0) + '</small></button>' +
          '<button class="icon-btn del" data-acc-del="' + esc(a.id) + '" aria-label="刪除">✕</button></div>').join('') +
      '<div class="btn-col" style="margin-top:10px"><button class="btn primary" data-acc-new>＋ 新增付款方式</button></div>' +
      '<div class="sr-d" style="margin-top:8px">例如：信用卡、八達通、銀行卡、微信支付、PayMe。內建的四個帳戶不會受影響。</div>' +
      '</div></div>' +
      '<div class="set-section"><h3>初始餘額</h3><div class="card">' +
      C.ACCOUNTS.map(a => '<div class="set-row"><span' + (a.builtin ? '' : ' data-notr') + '>' + esc(a.name) + '</span><span>' + fmt(state.initial[a.id] || 0) + '</span></div>').join('') +
      '<div class="set-row"><span><b>初始總資產</b></span><b>' + fmt(comp.initialTotal) + '</b></div>' +
      '<button class="btn" id="init-edit" style="width:100%;margin-top:6px">修改初始餘額</button></div></div>' +
      '<div class="set-section"><h3>其他</h3><div class="card">' +
      '<div class="set-row"><span>交易筆數</span><span>' + state.txs.length + '</span></div>' +
      '<div class="set-row"><span>資產核對</span><span class="' + (comp.reconciled ? 'pos' : 'neg') + '">' + (comp.reconciled ? '✓ 一致' : '✗ 不一致') + '</span></div>' +
      '<button class="btn danger" id="wipe" style="width:100%;margin-top:6px">清除所有交易並恢復初始狀態</button>' +
      '</div></div>' +
      '</div></div>';
  }
  function setQuick(arr) { state.settings.quickAmounts = arr; save(); renderSettings(); }
  $('#set-body').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const qa = [...state.settings.quickAmounts];
    const scl = state.settings.shortcuts;
    if (b.dataset.scEdit) { openShortcutEdit(b.dataset.scEdit); return; }
    if (b.dataset.scUp || b.dataset.scDown || b.dataset.scDel) {
      const i = +(b.dataset.scUp || b.dataset.scDown || b.dataset.scDel);
      if (b.dataset.scUp) [scl[i - 1], scl[i]] = [scl[i], scl[i - 1]];
      else if (b.dataset.scDown) [scl[i + 1], scl[i]] = [scl[i], scl[i + 1]];
      else { if (!confirm('刪除捷徑「' + scl[i].name + '」？')) return; scl.splice(i, 1); toast('已刪除捷徑'); }
      save(); renderSettings(); return;
    }
    if (b.id === 'sc-reset') {
      if (confirm('恢復預設捷徑？你自訂的捷徑會被取代。')) { state.settings.shortcuts = C.DEFAULT_SHORTCUTS.map(x => ({ ...x })); save(); renderSettings(); toast('已恢復預設捷徑'); }
      return;
    }
    if (b.dataset.up) { const i = +b.dataset.up; [qa[i - 1], qa[i]] = [qa[i], qa[i - 1]]; setQuick(qa); }
    else if (b.dataset.down) { const i = +b.dataset.down; [qa[i + 1], qa[i]] = [qa[i], qa[i + 1]]; setQuick(qa); }
    else if (b.dataset.del) { if (qa.length <= 1) { toast('最少要保留一個快捷金額'); return; } qa.splice(+b.dataset.del, 1); setQuick(qa); toast('已刪除快捷金額'); }
    else if (b.id === 'qa-add') {
      const v = C.toCents($('#qa-new').value);
      if (!(v > 0)) { toast('請輸入正確金額'); return; }
      if (qa.includes(v)) { toast('已有此金額'); return; }
      qa.push(v); setQuick(qa); toast('已新增 ' + fmt(v));
    }
    else if (b.id === 'qa-reset') { if (confirm('恢復預設快捷金額？')) { setQuick([...C.DEFAULT_QUICK]); toast('已恢復預設'); } }
    else if (b.dataset.mode) { state.settings.inputMode = b.dataset.mode; save(); renderSettings(); }
    else if (b.dataset.theme) { state.settings.theme = b.dataset.theme; save(); applyTheme(); renderSettings(); }
    else if (b.dataset.lang) { if (b.dataset.lang !== state.settings.lang) { state.settings.lang = b.dataset.lang; save(); location.reload(); } }
    else if (b.dataset.accEdit) openAccountEdit(b.dataset.accEdit);
    else if (b.dataset.accNew !== undefined) openAccountEdit(null);
    else if (b.dataset.accDel) deleteAccount(b.dataset.accDel);
    else if (b.id === 'ex-json') exportJSON();
    else if (b.id === 'ex-csv') exportCSV();
    else if (b.id === 'im-json') $('#im-file').click();
    else if (b.id === 'init-edit') openInitial();
    else if (b.id === 'wipe') {
      if (!confirm('確定清除所有交易？\n建議先匯出 JSON 備份。')) return;
      if (!confirm('再次確認：所有交易紀錄將會刪除，初始餘額恢復為預設值。')) return;
      commit([], '已清除所有交易', () => { state.initial = { ...C.DEFAULT_INITIAL }; });
    }
  });
  $('#set-body').addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.qi !== undefined) {
      const v = C.toCents(el.value);
      const qa = [...state.settings.quickAmounts];
      if (!(v > 0)) { toast('請輸入正確金額'); el.value = C.plain(qa[+el.dataset.qi]); return; }
      qa[+el.dataset.qi] = v; setQuick(qa); toast('已更新快捷金額');
    } else if (el.id === 'set-reset') { state.settings.resetAfter = el.checked; save(); }
    else if (el.id === 'set-cur') { state.settings.currency = el.value; save(); applyEnv(); quickSig = ''; refresh(); toast('已更改貨幣符號'); }
    else if (el.id === 'set-scdirect') { state.settings.shortcutDirect = el.checked; save(); }
    else if (el.id === 'im-file') { importFile(el.files[0]); el.value = ''; }
  });
  $('#set-body').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'qa-new') { e.preventDefault(); $('#qa-add').click(); } });

  /* ---------- 自訂付款方式 ---------- */
  function openAccountEdit(id) {
    const a = id ? state.accounts.find(x => x.id === id) : null;
    const cur = a || { name: '', kind: 'asset', color: C.PALETTE[state.accounts.length % C.PALETTE.length] };
    const bal = a ? (comp.balances[a.id] || 0) : 0;
    openSheet(a ? '編輯付款方式' : '新增付款方式',
      '<form class="form" id="acc-f" autocomplete="off">' +
      '<div><label class="field-label">名稱</label><input class="input" name="name" maxlength="16" placeholder="例如：八達通、信用卡、銀行卡" value="' + esc(cur.name) + '"></div>' +
      (a ? '' : '<div class="chips" style="margin:0">' + ['八達通', '信用卡', '銀行卡', '微信支付', 'PayMe', '轉數快'].map(n => '<button type="button" class="chip" data-preset="' + n + '">' + n + '</button>').join('') + '</div>') +
      '<div><label class="field-label">類型</label><div class="seg" data-seg="kind"><button type="button" data-v="asset" class="' + (cur.kind !== 'credit' ? 'on' : '') + '">一般帳戶</button><button type="button" data-v="credit" class="' + (cur.kind === 'credit' ? 'on' : '') + '">信用卡</button></div></div>' +
      '<div class="sr-d" id="acc-kind-d"></div>' +
      '<div><label class="field-label">顏色</label><div class="color-row">' + C.PALETTE.map(c => '<button type="button" class="color-dot' + (c === cur.color ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '</div></div>' +
      (a ? '<dl class="kv"><dt>目前餘額</dt><dd>' + fmt(bal) + '</dd></dl><div class="sr-d">要修改餘額，請使用「調整帳戶餘額」。</div>'
        : '<div><label class="field-label" id="acc-bal-l">目前餘額（可留空）</label><input class="input" name="bal" inputmode="decimal" placeholder="0.00"></div>') +
      '<div class="form-actions"><button type="button" class="btn" data-close>取消</button><button type="submit" class="btn primary">儲存</button></div></form>',
      body => {
        const f = body.querySelector('#acc-f');
        let kind = cur.kind === 'credit' ? 'credit' : 'asset', color = cur.color;
        const setKind = k => {
          kind = k;
          body.querySelectorAll('[data-seg="kind"] button').forEach(x => x.classList.toggle('on', x.dataset.v === k));
          body.querySelector('#acc-kind-d').textContent = k === 'credit'
            ? '信用卡消費會增加欠款（餘額顯示為負數）；還款時用「帳戶間轉帳」由其他帳戶轉入。'
            : '一般帳戶：例如八達通、銀行卡，消費時扣減餘額。';
          const l = body.querySelector('#acc-bal-l');
          if (l) l.textContent = k === 'credit' ? '目前欠款（可留空，輸入正數）' : '目前餘額（可留空）';
        };
        setKind(kind);
        body.querySelector('[data-seg="kind"]').addEventListener('click', e => {
          const b = e.target.closest('[data-v]');
          if (b) setKind(b.dataset.v);
        });
        body.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
          f.name.value = b.dataset.preset;
          setKind(b.dataset.preset === '信用卡' ? 'credit' : 'asset');
        }));
        body.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
          color = b.dataset.color;
          body.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b));
        }));
        f.addEventListener('submit', e => {
          e.preventDefault();
          const name = f.name.value.trim();
          if (!name) { f.name.focus(); return; }
          const reserved = ['A', 'a', '支付寶', 'Alipay', '現金', '零錢', '零錢筒'];
          const clash = reserved.includes(name) || C.ACCOUNTS.some(x => x.id !== (a && a.id) && (x.name === name || x.short === name));
          if (clash) { alert('已有同名的付款方式，請用其他名稱。'); return; }
          if (a) {
            Object.assign(a, { name, kind, color });
            save(); applyEnv(); closeSheet(); refresh(); toast('已更新付款方式');
            return;
          }
          let b0 = 0;
          if (f.bal && f.bal.value.trim() !== '') {
            b0 = sCents(f.bal.value);
            if (Number.isNaN(b0)) { alert('金額格式不正確'); return; }
            if (kind === 'credit') b0 = -Math.abs(b0);
          }
          const nid = 'acc-' + uid();
          state.accounts.push({ id: nid, name, kind, color });
          // 新帳戶的起始金額記作它的初始餘額，不影響其他帳戶及累計收支
          state.initial[nid] = b0;
          save(); applyEnv(); closeSheet(); refresh(); toast('已新增付款方式「' + name + '」');
        });
      });
  }
  function deleteAccount(id) {
    const a = state.accounts.find(x => x.id === id);
    if (!a) return;
    const used = state.txs.filter(t => C.involves(t, id)).length;
    if (used) { alert('「' + a.name + '」已有 ' + used + ' 筆交易紀錄，不能刪除。\n如不再使用，可以先把相關交易刪除或改用其他帳戶。'); return; }
    const b = state.initial[id] || 0;
    if (!confirm('刪除付款方式「' + a.name + '」？' + (b ? '\n它目前的金額 ' + fmt(b) + ' 會從總資產中移除。' : ''))) return;
    state.accounts = state.accounts.filter(x => x.id !== id);
    delete state.initial[id];
    state.settings.shortcuts.forEach(sc => { if (sc.account === id) sc.account = 'cash'; });
    if (qe.account === id) qe.account = 'cash';
    save(); applyEnv(); refresh(); toast('已刪除付款方式');
  }

  function openInitial() {
    openSheet('修改初始餘額',
      '<form class="form" id="init-f">' + C.ACCOUNTS.map(a => { const cr = a.kind === 'credit'; const v = state.initial[a.id] || 0; return '<div><label class="field-label"><span' + (a.builtin ? '' : ' data-notr') + '>' + esc(a.name) + '</span>' + (cr ? '（欠款，輸入正數）' : '') + '</label><input class="input" name="' + a.id + '" inputmode="decimal" value="' + C.plain(cr ? -v : v) + '"></div>'; }).join('') +
      '<div class="notice warn">修改初始餘額會影響所有餘額計算。若只是想更正目前餘額，請使用「調整帳戶餘額」。</div>' +
      '<div class="form-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary" type="submit">儲存</button></div></form>',
      body => body.querySelector('#init-f').addEventListener('submit', e => {
        e.preventDefault();
        const f = e.target, ni = {};
        for (const id of C.ACC_IDS) { const v = sCents(f[id].value); if (Number.isNaN(v)) { alert(NAME[id] + '金額格式不正確'); return; } ni[id] = C.ACC[id].kind === 'credit' ? -v : v; }
        const r = C.compute({ ...state, initial: ni });
        if (r.problems.some(p => p.hard)) { alert('這樣設定會令零錢或零錢筒出現負數，請檢查。'); return; }
        commit(state.txs, '已修改初始餘額', () => { state.initial = ni; });
        closeSheet();
      }));
  }

  /* ---------- 匯出 / 匯入 ---------- */
  function stamp() { const d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()); }
  async function deliver(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.maxTouchPoints > 0 && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return true;
  }
  async function exportJSON() {
    const data = JSON.stringify({ app: '記賬', exportedAt: new Date().toISOString(), ...state }, null, 2);
    if (await deliver('記賬備份-' + stamp() + '.json', data, 'application/json')) {
      state.meta.lastExport = Date.now(); save(); renderSettings(); toast('已匯出備份');
    }
  }
  async function exportCSV() {
    const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['交易編號', '日期時間', '交易類型', '項目', '金額', '支付/收入帳戶', '主要帳戶金額', '零錢金額', '轉出帳戶', '轉入帳戶', '調整前餘額', '調整後餘額', '調整金額', '備註']
      .concat(C.ACCOUNTS.flatMap(a => ['交易前-' + a.name, '交易後-' + a.name]), ['交易前總資產', '交易後總資產']);
    const lines = [head.map(q).join(',')];
    for (const r of comp.rows) {
      const t = r.tx, P = C.plain;
      const row = [t.no, C.fmtDateTime(t.time), C.TYPE_NAME[t.type], t.item,
        t.type === 'adjust' ? P(r.delta[t.account]) : P(C.txTotal(t)),
        t.type === 'expense' || t.type === 'income' || t.type === 'adjust' ? NAME[t.account] : '',
        t.type === 'expense' ? P(t.amount) : '', t.type === 'expense' ? P(t.change || 0) : '',
        t.type === 'transfer' ? NAME[t.from] : '', t.type === 'transfer' ? NAME[t.to] : '',
        t.type === 'adjust' ? P(r.before[t.account]) : '', t.type === 'adjust' ? P(r.after[t.account]) : '', t.type === 'adjust' ? P(r.delta[t.account]) : '',
        t.note].concat(C.ACC_IDS.flatMap(k => [P(r.before[k]), P(r.after[k])]), [P(r.totalBefore), P(r.totalAfter)]);
      lines.push(row.map(q).join(','));
    }
    if (await deliver('記賬紀錄-' + stamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv')) toast('已匯出 CSV');
  }
  function importFile(file) {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      let d;
      try { d = JSON.parse(rd.result); } catch (e) { alert('檔案不是有效的 JSON。'); return; }
      if (!d || !Array.isArray(d.txs) || !d.initial) { alert('這不是「記賬」的備份檔。'); return; }
      const okTx = d.txs.every(t => t && t.id && Number.isFinite(t.time) && ['expense', 'income', 'transfer', 'adjust'].includes(t.type));
      if (!okTx) { alert('備份檔內的交易資料格式不正確。'); return; }
      const ns = migrate(d);
      delete ns.app; delete ns.exportedAt;
      const r = C.compute(ns);
      if (!confirm('匯入後將以備份檔取代目前所有資料。\n\n備份：' + ns.txs.length + ' 筆交易，總資產 ' + fmt(r.total) + '\n目前：' + state.txs.length + ' 筆交易，總資產 ' + fmt(comp.total) + '\n\n確定匯入？')) return;
      try { localStorage.setItem(KEY + '.before-import', JSON.stringify(state)); } catch (_) { /* ignore */ }
      undoStack.push({ txs: state.txs, initial: { ...state.initial }, label: '已匯入備份' });
      state = ns;
      applyEnv();
      save(); applyTheme(); quickSig = ''; refresh();
      toast('已匯入及恢復 ' + ns.txs.length + ' 筆交易', true);
    };
    rd.readAsText(file);
  }

  /* ================= 主題 / 啟動 ================= */
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme();
  if (window.I18N) I18N.setLang(state.settings.lang);
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(p => p || navigator.storage.persist()).then(p => { renderSettings.persisted = p; if (view === 'settings') renderSettings(); }).catch(() => {});
  }
  // 其他分頁修改資料時同步
  window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); applyEnv(); quickSig = ''; refresh(); } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  }
  route();

  // 方便測試
  window.__jz = { get state() { return state; }, get comp() { return comp; }, qe };
})();
