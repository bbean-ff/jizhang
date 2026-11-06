/* 記賬 — 介面語言（繁體為原文；简体以字詞轉換；English 以詞組對照）
 * 做法：畫面上所有文字節點、提示框都經 L() 轉換。使用者自己輸入的內容（項目名稱、
 * 自訂付款方式名稱等）以 data-notr 標記，不會被翻譯。
 */
(function (g) {
  'use strict';

  /* ---------- 繁 → 简 ---------- */
  const HANS_PHRASE = {
    '紀錄': '记录', '帳戶': '账户', '轉帳': '转账', '檔案': '文件', '預設': '默认', '設定': '设置', '資料': '数据',
    '匯出': '导出', '匯入': '导入', '支付寶': '支付宝', '八達通': '八达通', '儲存': '保存', '撤銷': '撤销', '透支': '透支',
    '捷徑': '快捷', '記賬': '记账', '零錢筒': '零钱罐', '瀏覽器': '浏览器', '主畫面': '主屏幕', '星期日': '星期日',
  };
  const T = '並亞來個備儲內刪則動匯啟嗎圓塊實寶將對帳幣幫後徑從復態應戶換擊敗數於時會條樣機檔檢權歐沒淨淺減瀏為狀獲現產畫盡確稱筆紀細統經編總繼續與處號覽觀訂計記設註試詳認語調請議變讓負貨買費資賬輯輸轉這週達適選還銀銷錄錢鎊門閉間關際韓響頁項須預額顏類顯餘馬體點';
  const S = '并亚来个备储内删则动汇启吗圆块实宝将对账币帮后径从复态应户换击败数于时会条样机档检权欧没净浅减浏为状获现产画尽确称笔纪细统经编总继续与处号览观订计记设注试详认语调请议变让负货买费资账辑输转这周达适选还银销录钱镑门闭间关际韩响页项须预额颜类显余马体点';
  const HANS_CHAR = {};
  for (let i = 0; i < T.length; i++) HANS_CHAR[T[i]] = S[i];

  /* ---------- 繁 → English ---------- */
  const EN = {
    // 長句
    '信用卡消費會增加欠款（餘額顯示為負數）；還款時用「帳戶間轉帳」由其他帳戶轉入。': 'Card spending adds to the debt (shown as a negative balance). To repay, use "Transfer" from another account.',
    '修改初始餘額會影響所有餘額計算。若只是想更正目前餘額，請使用「調整帳戶餘額」。': 'Changing opening balances affects every balance. To correct a current balance, use "Adjust balance" instead.',
    '調整不會計入累計收入或支出，會另外記錄調整金額，方便資產核對。': 'Adjustments are not counted as income or expense; the difference is recorded separately for reconciliation.',
    '再次確認：所有交易紀錄將會刪除，初始餘額恢復為預設值。': 'Confirm again: all transactions will be deleted and opening balances reset to defaults.',
    '只適用於有預設金額的捷徑；關閉時會先填入記賬頁讓你確認': 'Only for shortcuts with a preset amount; when off, the entry page is filled in for you to confirm',
    '如不再使用，可以先把相關交易刪除或改用其他帳戶。': 'If you no longer use it, delete those transactions or move them to another account first.',
    '一般帳戶：例如八達通、銀行卡，消費時扣減餘額。': 'Regular account (e.g. Octopus, bank card): spending reduces the balance.',
    '儲存後，所有帳戶餘額及累計收支會自動重新計算。': 'After saving, all balances and totals are recalculated automatically.',
    '帳戶間轉帳：不計入收入或支出，總資產不變。': 'Transfer between accounts: not income or expense; total assets unchanged.',
    '帳戶間轉帳不計入收入或支出，總資產不變。': 'Transfers are not income or expense; total assets unchanged.',
    '早餐、午餐、晚餐、買水、交通、零用錢、薪金': 'Breakfast, Lunch, Dinner, Water, Transport, Pocket money, Salary',
    '這樣設定會令零錢或零錢筒出現負數，請檢查。': 'This would make Change or Coin jar negative. Please check.',
    '例如：信用卡、八達通、銀行卡、微信支付、': 'e.g. Credit card, Octopus, Bank card, WeChat Pay, ',
    '正在輸入零錢金額，再按「＋」可取消零錢': 'Entering the change amount — tap "＋" again to cancel',
    '預設金額（可留空，留空則每次自行輸入）': 'Preset amount (optional — leave blank to enter each time)',
    '刪除後所有餘額及統計會自動重新計算。': 'Balances and statistics will be recalculated after deleting.',
    '恢復預設捷徑？你自訂的捷徑會被取代。': 'Restore default shortcuts? Your custom shortcuts will be replaced.',
    '要修改餘額，請使用「調整帳戶餘額」。': 'To change the balance, use "Adjust balance".',
    '匯入後將以備份檔取代目前所有資料。': 'Importing replaces all current data with the backup.',
    '只改變顯示的貨幣符號，不會換算金額': 'Only changes the symbol shown; amounts are not converted',
    '已有同名的付款方式，請用其他名稱。': 'A payment method with this name already exists. Please choose another name.',
    '將零錢全部轉入零錢筒（沒有零錢）': 'Move all change to coin jar (no change)',
    '資料保存在本機（此瀏覽器／主畫面': 'Data is stored on this device (this browser / home screen ',
    '備份檔內的交易資料格式不正確。': 'The transactions in the backup file are invalid.',
    '例如：八達通、信用卡、銀行卡': 'e.g. Octopus, Credit card, Bank card',
    '目前欠款（可留空，輸入正數）': 'Current debt (optional, enter a positive number)',
    '內建的四個帳戶不會受影響。': 'The four built-in accounts are not affected.',
    '尚未有紀錄。試試輸入「早餐': 'No records yet. Try typing "早餐',
    '清除所有交易並恢復初始狀態': 'Clear all transactions and reset',
    '記賬後重設為「現金支出」': 'Reset to "Cash expense" after each entry',
    '這不是「賬本Ledger」的備份檔。': 'This is not a 賬本Ledger backup file.',
    '例如：午餐、買水、薪金': 'e.g. Lunch, Water, Salary',
    '常用捷徑（支出／收入）': 'Shortcuts (expense / income)',
    '最少要保留一個快捷金額': 'Keep at least one quick amount',
    '核對不一致，請檢查資料': 'Does not reconcile — please check your data',
    '筆交易紀錄，不能刪除。': ' transactions and cannot be deleted.',
    '轉出及轉入帳戶不能相同': 'From and To accounts must differ',
    '零錢支付金額（可留空）': 'Paid with change (optional)',
    '餘額不足，記賬後會變成': ' balance is insufficient; after this it will be',
    '例如：早餐（可留空）': 'e.g. Breakfast (optional)',
    '個人記賬小工具（港幣': 'Personal ledger (HKD',
    '將零錢全部轉入零錢筒': 'Move all change to coin jar',
    '資產核對（全部紀錄）': 'Reconciliation (all records)',
    '零錢不足，不可透支。': 'Not enough change — overdraft is not allowed.',
    '備份（可用於恢復）': 'backup (for restoring)',
    '名稱（即記賬項目）': 'Name (used as the item)',
    '恢復預設快捷金額？': 'Restore default quick amounts?',
    '支出分類（按項目）': 'Expenses by item',
    '收入與支出（按月）': 'Income vs expense (monthly)',
    '會從總資產中移除。': ' will be removed from total assets.',
    '沒有符合條件的紀錄': 'No matching records',
    '目前餘額（可留空）': 'Current balance (optional)',
    '看不懂，例子：早餐': 'Not understood. Examples: 早餐',
    '確定刪除這筆交易？': 'Delete this transaction?',
    '確定清除所有交易？': 'Clear all transactions?',
    '不足，不可透支。': ' is insufficient — overdraft not allowed.',
    '已新增付款方式「': 'Added payment method "',
    '恢復預設快捷金額': 'Restore default quick amounts',
    '欠款，輸入正數）': 'debt, positive number)',
    '沒有可撤銷的操作': 'Nothing to undo',
    '請盡快匯出備份。': 'Please export a backup soon.',
    '點擊捷徑直接記賬': 'Record instantly when tapping a shortcut',
    '付款方式／帳戶': 'Payment methods / accounts',
    '例如：核對錢包': 'e.g. Checked wallet',
    '備份匯入及恢復': 'backup import & restore',
    '刪除付款方式「': 'Delete payment method "',
    '各帳戶資金變化': 'Account changes',
    '已修改初始餘額': 'Opening balances updated',
    '已刪除付款方式': 'Payment method deleted',
    '已刪除快捷金額': 'Quick amount deleted',
    '已恢復預設捷徑': 'Default shortcuts restored',
    '已更改貨幣符號': 'Currency symbol changed',
    '已更新付款方式': 'Payment method updated',
    '已更新快捷金額': 'Quick amount updated',
    '已清除所有交易': 'All transactions cleared',
    '帳戶／付款方式': 'Account / payment method',
    '新增金額，例如': 'New amount, e.g.',
    '檔案不是有效的': 'The file is not valid',
    '此期間沒有支出': 'No expenses in this period',
    '深色／淺色模式': 'Dark / light mode',
    '筆交易，總資產': ' transactions, total assets',
    '請輸入日期時間': 'Please enter date and time',
    '請輸入正確金額': 'Please enter a valid amount',
    '資料備份及恢復': 'Backup & restore',
    '金額格式不正確': 'Invalid amount',
    '零錢不足（目前': 'Not enough change (now',
    '零錢轉入零錢筒': 'Change → coin jar',
    '顯示更多（尚有': 'Show more (',
    '餘額不足（目前': ' balance too low (now',
    '上次匯出備份': 'Last backup',
    '主要帳戶金額': 'Main account amount',
    '交易前總資產': 'Total before',
    '交易後總資產': 'Total after',
    '仍要繼續嗎？': 'Continue anyway?',
    '修改初始餘額': 'Edit opening balances',
    '它目前的金額': 'Its current amount',
    '尚未設定捷徑': 'No shortcuts yet',
    '已匯入及恢復': 'Imported and restored',
    '已新增捷徑「': 'Added shortcut "',
    '恢復預設捷徑': 'Restore default shortcuts',
    '手動調整淨額': 'Net manual adjustments',
    '收入請輸入「': 'For income type "',
    '文字快速輸入': 'Quick text entry',
    '新增付款方式': 'Add payment method',
    '沒有零錢可轉': 'No change to move',
    '直接設定：按': 'Set: tap',
    '確認後按記賬': 'confirm, then tap Record',
    '編輯付款方式': 'Edit payment method',
    '調整帳戶餘額': 'Adjust balance',
    '輸入新的餘額': 'Enter the new balance',
    '金額」，例如': 'amount", e.g.',
    '金額必須大於': 'Amount must be greater than',
    '金額輸入模式': 'Amount input mode',
    '關閉後會保留': 'When off, keeps',
    '零錢目前餘額': 'Change balance',
    '預計轉帳金額': 'Amount to move',
    '餘額沒有變化': 'Balance unchanged',
    '馬來西亞令吉': 'Malaysian ringgit',
    '不可透支。': 'overdraft not allowed.',
    '以表格顯示': 'Show as table',
    '儲存失敗：': 'Save failed: ',
    '初始總資產': 'Opening total',
    '刪除捷徑「': 'Delete shortcut "',
    '實際總資產': 'Actual total',
    '已刪除捷徑': 'Shortcut deleted',
    '已匯入備份': 'Backup imported',
    '已匯出備份': 'Backup exported',
    '已恢復預設': 'Defaults restored',
    '已更新捷徑': 'Shortcut updated',
    '已有此金額': 'Amount already exists',
    '帳戶間轉帳': 'Transfer',
    '建議先匯出': 'Export first is recommended',
    '應有總資產': 'Expected total',
    '撤銷此交易': 'Undo this transaction',
    '日均支出（': 'Daily average (',
    '淨額（收入': 'Net (income',
    '目前欠款（': 'Current debt (',
    '目前零錢：': 'Change now: ',
    '確定匯入？': 'Import?',
    '語言及貨幣': 'Language & currency',
    '調整前餘額': 'Balance before',
    '調整後餘額': 'Balance after',
    '請輸入金額': 'Please enter an amount',
    '輸入正數）': 'positive number)',
    '轉入零錢筒': ' to coin jar',
    '需要零錢：': 'Change needed: ',
    '餘額已經是': ' balance is already',
    '餘額設定為': ' balance set to',
    '一般帳戶': 'Regular',
    '不可透支': 'overdraft not allowed',
    '交易筆數': 'Transactions',
    '交易紀錄': 'Records',
    '交易編號': 'No.',
    '交易類型': 'Type',
    '今日支出': 'Spent today',
    '全部帳戶': 'All accounts',
    '全部類型': 'All types',
    '其他項目': 'Other items',
    '初始餘額': 'Opening balances',
    '已修改：': 'Updated: ',
    '已刪除：': 'Deleted: ',
    '已填入「': 'Filled in "',
    '已撤銷：': 'Undone: ',
    '已記賬：': 'Recorded: ',
    '帳戶轉帳': 'Transfer',
    '常用捷徑': 'Shortcuts',
    '微信支付': 'WeChat Pay',
    '快捷金額': 'Quick amounts',
    '快速記賬': 'Quick entry',
    '快速輸入': 'Quick input',
    '恢復預設': 'Restore defaults',
    '持久儲存': 'Persistent storage',
    '支付寶）': 'Alipay)',
    '支付帳戶': 'Paid with',
    '支付拆分': 'Split',
    '收入帳戶': 'To account',
    '收入模式': 'income mode',
    '收入金額': 'Income',
    '新加坡元': 'Singapore dollar',
    '新增捷徑': 'Add shortcut',
    '日期時間': 'Date & time',
    '最近紀錄': 'Recent',
    '未獲授權': 'Not granted',
    '本月支出': 'Spent this month',
    '核對一致': 'Reconciled',
    '每日支出': 'Daily expenses',
    '每月支出': 'Monthly expenses',
    '沒有資料': 'No data',
    '目前餘額': 'Current balance',
    '直接設定': 'Set',
    '確認調整': 'Confirm',
    '確認轉入': 'Confirm',
    '確認轉帳': 'Confirm',
    '累計支出': 'Total expense',
    '累計收入': 'Total income',
    '編輯交易': 'Edit transaction',
    '編輯捷徑': 'Edit shortcut',
    '記賬備份': 'ledger-backup',
    '記賬紀錄': 'ledger-records',
    '設定為（': 'Set to (',
    '詳細記賬': 'Detailed entry',
    '調整金額': 'Adjustment',
    '資產核對': 'Reconciliation',
    '轉入帳戶': 'To',
    '轉出帳戶': 'From',
    '零錢支付': 'paid with change',
    '零錢金額': 'Change amount',
    '餘額調整': 'Balance adjustment',
    'Alipay（支付寶）': 'Alipay',
    '不一致': 'mismatch',
    '交易前': 'Before',
    '交易後': 'After',
    '人民幣': 'Chinese yuan',
    '信用卡': 'Credit card',
    '八達通': 'Octopus',
    '已匯出': 'Exported',
    '已啟用': 'Enabled',
    '已新增': 'Added',
    '已選「': 'Selected "',
    '新台幣': 'New Taiwan dollar',
    '會變成': ' will become',
    '澳門幣': 'Macau pataca',
    '筆交易': ' transactions',
    '總支出': 'Total',
    '總資產': 'Total assets',
    '轉數快': 'FPS',
    '銀行卡': 'Bank card',
    '零用錢': 'Pocket money',
    '零錢筒': 'Coin jar',
    '支付寶': 'Alipay',
    '一致': 'match',
    '上月': 'Last month',
    '上移': 'Move up',
    '下移': 'Move down',
    '交通': 'Transport',
    '今年': 'This year',
    '今日': 'Today',
    '例如': 'e.g.',
    '備註': 'Note',
    '儲存': 'Save',
    '內建': 'Built-in',
    '全部': 'All',
    '其他': 'Other',
    '刪除': 'Delete',
    '匯出': 'Export',
    '午餐': 'Lunch',
    '取消': 'Cancel',
    '名稱': 'Name',
    '外觀': 'Appearance',
    '帳戶': 'Account',
    '從未': 'Never',
    '撤銷': 'Undo',
    '支付': ' paid',
    '支出': 'expense',
    '收入': 'income',
    '新增': 'Add',
    '日圓': 'Japanese yen',
    '日期': 'Date',
    '早餐': 'Breakfast',
    '昨日': 'Yesterday',
    '晚餐': 'Dinner',
    '月份': 'Month',
    '期初': 'Start',
    '期末': 'End',
    '本月': 'This month',
    '本週': 'This week',
    '欠款': 'Debt',
    '歐元': 'Euro',
    '深色': 'Dark',
    '淺色': 'Light',
    '清除': 'Clear',
    '港幣': 'Hong Kong dollar',
    '現金': 'Cash',
    '管理': 'Manage',
    '紀錄': 'Records',
    '累加': 'Add up',
    '統計': 'Stats',
    '編輯': 'Edit',
    '美元': 'US dollar',
    '自動': 'Auto',
    '自訂': 'Custom',
    '英鎊': 'Pound sterling',
    '薪金': 'Salary',
    '記賬': 'Record',
    '設定': 'Settings',
    '詳情': 'details',
    '語言': 'Language',
    '變化': 'Change',
    '貨幣': 'Currency',
    '買水': 'Water',
    '轉入': 'To',
    '轉出': 'From',
    '轉帳': 'Transfer',
    '金額': 'Amount',
    '關閉': 'Close',
    '零錢': 'Change',
    '韓圓': 'Korean won',
    '項目': 'Item',
    '顏色': 'Colour',
    '類型': 'Type',
    '餘額': 'Balance',
    '首頁': 'Home',
    '共': 'Total',
    '至': 'to',
    '筆': '',
    '近': 'Last ',
    '首頁 ': 'Home',
  };
  // 其他常見片語
  Object.assign(EN, {
    '現金支出': 'Cash expense', '現金收入': 'Cash income',
    '快速記賬': 'Quick entry', '交易紀錄': 'Records',
    '記賬 ': 'Record ', '星期': '',
    '近7日': 'Last 7 days', '近30日': 'Last 30 days',
    '帳戶間轉帳': 'Transfer', '調整帳戶餘額': 'Adjust balance',
    '從 JSON 備份匯入及恢復': 'Import & restore from JSON backup',
    '匯出 JSON 備份（可用於恢復）': 'Export JSON backup (for restoring)',
    '匯出 CSV（Excel／Numbers）': 'Export CSV (Excel / Numbers)',
    '匯出 JSON 備份': 'Export JSON backup',
    '金額輸入模式': 'Amount input mode',
    '累加：20+10+5=35；直接設定：按 20 即 20': 'Add up: 20+10+5=35; Set: tapping 20 gives 20',
    '關閉後會保留 A／收入模式': 'When off, keeps Alipay / income mode',
    '記賬後重設為「現金支出」': 'Reset to "Cash expense" after each entry',
    '深色／淺色模式': 'Dark / light mode',
    '交易筆數': 'Transactions',
    '清除所有交易並恢復初始狀態': 'Clear all transactions and reset',
    '持久儲存': 'Persistent storage',
    '資料保存在本機（此瀏覽器／主畫面 App）': 'Data is stored on this device (this browser / home-screen app)',
    '新增金額，例如 3.5': 'New amount, e.g. 3.5',
    '恢復預設快捷金額': 'Restore default quick amounts',
    '文字快速輸入：早餐30+5、A+100…': 'Text: 早餐30+5, A+100…',
    '早餐25、糖A10、早餐30+5、現金+350': '早餐25, 糖A10, 早餐30+5, 現金+350',
    '早餐30+5、A+100、A設成1.48': '早餐30+5, A+100, A設成1.48',
    '例如：早餐（可留空）': 'e.g. Breakfast (optional)',
    '詳細記賬': 'Detailed entry',
    '以表格顯示': 'Show as table',
    '日均支出': 'Daily average',
    '淨額（收入 − 支出）': 'Net (income − expense)',
    '收入與支出（按月）': 'Income vs expense (monthly)',
    '一般帳戶': 'Regular account',
    '信用卡（記欠款）': 'Credit card',
    '零錢付款': 'paid with change',
    '總支出': 'Total',
    '收入 ': 'Income ',
    '支付寶': 'Alipay',
    '設定為': 'Set to', '設定': 'Settings',
    '支': '−', '收': '+',
  });

  const WEEK_EN = { '日': 'Sun', '一': 'Mon', '二': 'Tue', '三': 'Wed', '四': 'Thu', '五': 'Fri', '六': 'Sat' };
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PUNCT = { '，': ', ', '。': '. ', '：': ': ', '；': '; ', '「': '"', '」': '"', '（': ' (', '）': ')', '、': ', ', '？': '?', '！': '!', '／': ' / ', '　': ' ' };
  let enRe = null, hansRe = null;
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function buildRe(keys) { return new RegExp(keys.sort((a, b) => b.length - a.length).map(escRe).join('|'), 'g'); }

  let lang = 'zh-Hant';
  const HAS_CJK = /[㐀-鿿（）「」，。：；、！？／]/;

  function toHans(s) {
    if (!hansRe) hansRe = buildRe(Object.keys(HANS_PHRASE));
    return s.replace(hansRe, m => HANS_PHRASE[m]).replace(/[㐀-鿿]/g, c => HANS_CHAR[c] || c);
  }
  function toEn(s) {
    if (!HAS_CJK.test(s)) return s;
    const cap = x => x.replace(/^(\s*)([a-z])/, (m, sp, c) => sp + c.toUpperCase());
    if (EN[s]) return cap(EN[s]);
    const tr = s.trim();
    if (EN[tr]) return cap(s.replace(tr, EN[tr]));
    let out = s
      .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g, (m, y, mo, d) => MON_EN[mo - 1] + ' ' + d + ', ' + y)
      .replace(/(\d{1,2})月(\d{1,2})日/g, (m, mo, d) => MON_EN[mo - 1] + ' ' + d)
      .replace(/(\d{4})年(\d{1,2})月/g, (m, y, mo) => MON_EN[mo - 1] + ' ' + y)
      .replace(/(\d{1,2})月(?![㐀-鿿])/g, (m, mo) => MON_EN[mo - 1])
      .replace(/星期([日一二三四五六])/g, (m, d) => WEEK_EN[d])
      .replace(/(\d+)\s*日）/g, '$1 days)');
    if (!enRe) enRe = buildRe(Object.keys(EN));
    out = out.replace(enRe, m => EN[m]);
    out = out.replace(/[，。：；「」（）、？！／　]/g, c => PUNCT[c]);
    out = out.replace(/ {2,}/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/^ +/, s.startsWith(' ') ? ' ' : '');
    return out.replace(/^(\s*)([a-z])/, (m, sp, c) => sp + c.toUpperCase());
  }
  function L(s) {
    if (s == null) return s;
    s = String(s);
    if (lang === 'zh-Hans') return toHans(s);
    if (lang === 'en') return toEn(s);
    return s;
  }

  /* ---------- 畫面翻譯 ---------- */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);
  function skip(node) {
    for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
      if (el.hasAttribute && el.hasAttribute('data-notr')) return true;
      if (SKIP.has(el.tagName)) return true;
    }
    return false;
  }
  function trText(n) {
    if (skip(n)) return;
    const v = n.nodeValue;
    if (!v || !HAS_CJK.test(v)) return;
    const t = L(v);
    if (t !== v) n.nodeValue = t;
  }
  function trAttrs(el) {
    if (skip(el)) return;
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && HAS_CJK.test(v)) { const t = L(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
  function translate(root) {
    if (lang === 'zh-Hant' || !root) return;
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) trAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
  }
  let observer = null;
  function setLang(l) {
    lang = l === 'zh-Hans' || l === 'en' ? l : 'zh-Hant';
    document.documentElement.lang = lang === 'en' ? 'en' : lang === 'zh-Hans' ? 'zh-Hans' : 'zh-Hant-HK';
    if (lang === 'zh-Hant') return;
    translate(document.body);
    if (!observer) {
      observer = new MutationObserver(muts => {
        for (const m of muts) {
          if (m.type === 'characterData') trText(m.target);
          else if (m.type === 'attributes') trAttrs(m.target);
          else m.addedNodes.forEach(translate);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
    }
    // 提示框
    const A = g.alert.bind(g), Cf = g.confirm.bind(g);
    g.alert = m => A(L(m));
    g.confirm = m => Cf(L(m));
  }

  g.I18N = { setLang, L, translate, get lang() { return lang; } };
})(window);
