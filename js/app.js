/* =====================================================================
 * app.js ── 真馨相守 CLX 報價計算與畫面更新（純 JavaScript，不需要任何框架或伺服器）
 * 南方通訊處版 115/10/08：版面、業務員資料、客戶頁連結（#q=）、下載彙整圖沿用 AJI 工具；
 * compute() 依 CLX 官方費率表／投保規則／保費規定／商品說明／建議書 xlsx（見 rates.js）。
 * 所有費率與參數都在 rates.js；本檔只放「計算邏輯」與「畫面呈現」。
 * ===================================================================== */
(function () {
  "use strict";

  var R = window.QUOTE_RATES;
  var RULES = R.RULES;

  var money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }); // 金額：整數
  var wan = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });   // 萬元

  /* ---------------------------------------------------------------
   * 民國生日 → 足歲與保險年齡（同 AJI／意外險工具）
   * 富邦「保險年齡」：足歲＋（最近一次生日後超過 6 個月 ? 1 : 0）；剛好滿 6 個月當天不加歲。
   * 回傳 { birth, exactAge, age }；日期不存在 → null；生日在未來 → age = -1。
   * --------------------------------------------------------------- */
  function dateClamped(year, month0, day) {
    var first = new Date(year, month0, 1);
    var lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
  }

  function parseRocBirth(value, today) {
    var digits = String(value).replace(/\D/g, "");
    if (digits.length !== 6 && digits.length !== 7) return null;
    var yearDigits = digits.length - 4;
    var rocYear = Number(digits.slice(0, yearDigits));
    var month = Number(digits.slice(yearDigits, yearDigits + 2));
    var day = Number(digits.slice(yearDigits + 2));
    var year = rocYear + 1911;
    var birth = new Date(year, month - 1, day);
    if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null;

    var now = today || new Date();
    var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (birth > today0) return { birth: birth, exactAge: -1, age: -1 };

    var exactAge = today0.getFullYear() - year;
    if (dateClamped(today0.getFullYear(), month - 1, day) > today0) exactAge -= 1;
    var halfDay = dateClamped(year + exactAge, month - 1 + RULES.insuranceAge.roundUpAfterMonths, day);
    var age = exactAge + (today0 > halfDay ? 1 : 0);
    return { birth: birth, exactAge: exactAge, age: age };
  }

  /** 特定癌症（重度）給付比例：第1年度 0；第2～5年度 10%～40%；第6年度起 50%（商品說明） */
  function specificPct(y) {
    if (y < 2) return 0;
    return RULES.specificPct[Math.min(y, 6)];
  }

  /* ---------------------------------------------------------------
   * 核心計算（純函式）：輸入 state（today 可指定，方便驗算），回傳保費與各項給付
   * --------------------------------------------------------------- */
  function compute(s, today) {
    var parsed = parseRocBirth(s.rocBirth, today);
    var age = parsed ? parsed.age : -1, exactAge = parsed ? parsed.exactAge : -1;
    var term = s.term, termN = Number(term), range = RULES.ages[term];
    var amt = s.amount;                               // 保險金額（萬元）
    var pay = R.PAY_MODES[s.payMode];

    // ---- 投保檢核（投保規則；建議書：最低看足歲、最高看保險年齡） ----
    var ageError = !parsed || age < 0 ? "請輸入正確的民國生日（6或7碼）"
      : exactAge < range[0] ? "CLX 最低投保年齡為 " + range[0] + " 足歲（目前足歲 " + exactAge + " 歲）"
      : age > range[1] ? "CLX " + term + " 年期投保年齡最高 " + range[1] + " 歲（目前保險年齡 " + age + " 歲）" +
        (term === "10" ? "" : age <= RULES.ages["10"][1] ? "，可改選 10 年期" : "")
      : "";
    var amountError = (!(amt >= RULES.min) || amt > RULES.max || amt % 1)
      ? "保險金額須為 " + RULES.min + "～" + RULES.max + " 萬元（以萬元為單位）" : "";
    var ok = !ageError && !amountError;
    var rate = ok ? R.RATES[term][age] : undefined;
    if (ok && !rate) { ok = false; ageError = "費率表無保險年齡 " + age + " 歲之 " + term + " 年期費率"; }

    var res = {
      age: age, exactAge: exactAge, term: term, termN: termN, pay: pay, amount: amt,
      ok: ok, ageError: ageError, amountError: amountError, rate: rate, years: []
    };
    if (!ok) return res;

    // ---- 保費（建議書 OP!C31、C35、C46～C52） ----
    var base = Math.round(amt * rate * 10) / 10;               // 原始年繳保費＝ROUND(保額萬 × 費率, 1)
    var modal = Math.round(base * pay.factor);                  // 各期表定保費＝ROUND(年繳 × 繳別係數, 0)
    var fm = R.PAY_METHODS.first[s.firstMethod], rm = R.PAY_METHODS.renew[s.renewMethod];
    var d1 = Math.min(fm.disc, RULES.maxDiscount), d2 = Math.min(rm.disc, RULES.maxDiscount);
    var firstPay = Math.round(modal * (1 - d1));                // 首期實繳
    var renewPay = Math.round(modal * (1 - d2));                // 續期實繳
    var healthRenew = Math.round(modal * (1 - (d2 + RULES.healthDiscount))); // 建議書 OP!N44
    var n = pay.perYear;
    var year1Paid = n === 12 ? firstPay * 2 + renewPay * 10 : firstPay + renewPay * (n - 1); // OP!C51（月繳首期須繳 2 個月）
    var laterPaid = renewPay * n;                               // OP!C52
    var totalPaid = year1Paid + laterPaid * (termN - 1);
    var totalPaidHealth = year1Paid + healthRenew * n * (termN - 1);

    // ---- 給付（商品說明／條款；建議書 DIE、EXP 驗證） ----
    var sa = amt * 1e4;
    var annualStd = amt * rate;                                 // 「年繳保險費總和」第一目：保額(萬) × 年繳標準體費率
    var year1Cancer = Math.round(annualStd * RULES.returnRatio); // 第1年度 初期／輕度、重度：年繳保險費總和 × 1.06
    var maturity = Math.round(annualStd * termN * RULES.returnRatio); // 滿期／身故（繳費期滿後）：× 實際繳費年度數 × 1.06
    var coverYears = RULES.coverToAge - age + 1;                // 保障至保險年齡屆滿 89 歲
    function deathAt(y) { return Math.round(annualStd * Math.min(y, termN) * RULES.returnRatio); }

    var cy = Math.max(1, Math.min(coverYears, Math.floor(Number(s.claimYear) || 1)));
    var early = cy === 1 ? year1Cancer : Math.round(sa * RULES.earlyPct);
    var severe = cy === 1 ? year1Cancer : Math.round(sa * RULES.severePct);
    var spec = Math.round(sa * specificPct(cy));
    var waiveYears = Math.max(0, termN - cy);                   // 確診年度之後仍須繳費的年度數（至少可免繳）
    var waived = waiveYears * laterPaid;

    // 第1～6保單年度確診的癌症給付（圖像點選年度按鈕用；第6年度起相同）
    var cancerByYear = [1, 2, 3, 4, 5, 6].map(function (yy) {
      return { year: yy, early: yy === 1 ? year1Cancer : Math.round(sa * RULES.earlyPct), severe: yy === 1 ? year1Cancer : Math.round(sa * RULES.severePct),
        specPct: specificPct(yy), spec: Math.round(sa * specificPct(yy)) };
    });

    var marks = [1, 2, 3, 4, 5, 6, 10, 15, 20, 25, 30, 40, 50, 60, 70];
    if (marks.indexOf(termN) < 0) marks.push(termN);
    var years = marks.filter(function (y) { return y < coverYears; }).concat([coverYears]).sort(function (a, b) { return a - b; });
    years.forEach(function (y) {
      res.years.push({
        year: y, age: age + y - 1,
        paid: y <= 1 ? year1Paid : year1Paid + laterPaid * (Math.min(y, termN) - 1),
        death: deathAt(y),
        early: y === 1 ? year1Cancer : Math.round(sa * RULES.earlyPct),
        severe: y === 1 ? year1Cancer : sa,
        spec: Math.round(sa * specificPct(y)),
        maturity: y === coverYears ? maturity : 0
      });
    });

    return Object.assign(res, {
      base: base, modal: modal, d1: d1, d2: d2, firstMethod: fm, renewMethod: rm,
      firstPay: firstPay, renewPay: renewPay, healthRenew: healthRenew,
      year1Paid: year1Paid, laterPaid: laterPaid, totalPaid: totalPaid, totalPaidHealth: totalPaidHealth,
      sa: sa, annualStd: annualStd, year1Cancer: year1Cancer, maturity: maturity, coverYears: coverYears,
      endAge: RULES.coverToAge, death1: deathAt(1),
      early2: Math.round(sa * RULES.earlyPct), surgery: Math.round(sa * RULES.surgeryPct), illness: Math.round(sa * RULES.illnessPct),
      specMax: Math.round(sa * RULES.specificPct[6]),
      cancerByYear: cancerByYear, claimYear: cy, early: early, severe: severe, spec: spec, severeSpec: severe + spec,
      waiveYears: waiveYears, waived: waived
    });
  }

  /* =====================================================================
   * 畫面
   * ===================================================================== */
  var STORE_KEY = "nf-clx-quote-draft-v1";
  var STATE_KEYS = Object.keys(R.DEFAULTS);
  var AP = window.AgentProfile;
  var linkAgent = null; // 客戶頁連結帶來的業務員資料
  function currentAgent() { return clientMode ? (linkAgent || AP.sanitize({})) : AP.load(); }
  var ASSET_V = (function () {
    var sc = document.querySelector('script[src*="app.js"]');
    var m = sc && /[?&]v=([^&]+)/.exec(sc.getAttribute("src"));
    return m ? m[1] : "";
  })();
  var LOGO = "img/logo.png" + (ASSET_V ? "?v=" + ASSET_V : "");

  var state = JSON.parse(JSON.stringify(R.DEFAULTS));
  var clientMode = false;
  var $ = function (id) { return document.getElementById(id); };

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fillOptions(sel, items) {
    sel.innerHTML = items.map(function (it) {
      return '<option value="' + esc(it[0]) + '">' + esc(it[1]) + "</option>";
    }).join("");
  }
  function syncNumber(input, value) {
    if ((value === 0 && input.value === "") || input.value != value) input.value = String(value);
  }
  function syncText(input, value) {
    if (input.value !== String(value)) input.value = String(value);
  }
  function showText(el, text) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
  }
  function pct(v) { return Math.round(v * 1000) / 10 + "%"; }

  var SPLIT = "<!--bodymap-->";
  function quoteHtml(c, s) {
    var yuan = function (v) { return money.format(v) + " 元"; };
    var wanY = function (v) { return wan.format(v / 1e4) + " 萬"; };
    var alert = c.ageError || c.amountError;
    var h = "";

    // ---- 頁首 ----
    h += '<section class="q-hero"><div class="hero-tags"><span class="hero-tag">富邦人壽｜真馨相守防癌定期健康保險 CLX</span>' +
      '<span class="hero-badge gold">女性專屬</span></div>' +
      '<h1 class="q-title"><span class="q-name">' + esc(s.name || "未填姓名") + '</span><span class="ttl">的女性防癌保障</span></h1>' +
      '<div class="hero-trip"><span>' + (c.age >= 0 ? "保險年齡 <b>" + c.age + "</b> 歲" : "年齡待確認") + "</span>" +
      "<span>女性</span><span>保額 <b>" + esc(s.amount) + "</b> 萬</span><span>繳費 " + esc(s.term) + " 年</span><span>" + esc(c.pay.label) + "</span>" +
      (c.ok ? "<span>保障至 " + c.endAge + " 歲</span>" : "") + "</div>" +
      '<div class="q-total"><small>' + esc(c.pay.suffix) + "保費（首期・" + esc(c.ok ? c.firstMethod.label : "") + "）</small>" +
      (c.ok ? '<span class="c">NT$</span><b>' + money.format(c.firstPay) + '</b><span class="u">元</span>' +
        '<em class="q-total-sub">表定 ' + yuan(c.modal) + (c.d1 ? "，折扣 " + pct(c.d1) : "") + "｜續期 " + yuan(c.renewPay) + "</em>"
        : '<b class="miss">待確認</b>') + "</div></section>";
    if (alert) h += '<div class="alert-strip">' + esc(alert) + "</div>";
    if (!c.ok) return h;

    // ---- 重點數字 ----
    h += '<section class="q-highlights">' +
      '<div class="hl-main"><small>確診女性特定癌症（重度）<br>第6保單年度起</small><b>' + wanY(c.sa + c.specMax) + "</b><span>保額 100%＋50%</span></div>" +
      "<div><small>確診癌症（重度）<br>第2保單年度起</small><b>" + wanY(c.sa) + "</b><span>保額 100%</span></div>" +
      "<div><small>癌症（初期）或（輕度）<br>第2保單年度起</small><b>" + wanY(c.early2) + "</b><span>保額 10%</span></div>" +
      "<div><small>滿期保險金<br>保險年齡屆滿 " + c.endAge + " 歲</small><b>" + wanY(c.maturity) + "</b><span>年繳保費總和 × 1.06</span></div>" +
      "</section>";

    // ---- 保障內容 ----
    function lines(arr) { return arr.map(function (t) { return '<span class="amt-line">' + esc(t) + "</span>"; }).join(""); }
    function brow(n, title, amount, note, cls) {
      return '<tr class="' + (cls || "") + '"><td class="k"><span class="bn">' + n + "</span>" + esc(title) + "<small>" + esc(note) + "</small></td>" +
        "<td>" + amount + "</td></tr>";
    }
    // 條款附表一 C43～C58 的白話簡稱（完整名稱見 rates.js SPECIFIC_CANCERS）
    var specList = ["乳房", "子宮頸", "子宮體及子宮", "卵巢", "外陰", "陰道", "胎盤", "其他女性生殖器官", "皮膚（含惡性黑色素瘤）"];
    h += '<section class="cmp-card q-benefits"><h2 class="sec-title big">保障內容<small>符合條款約定時給付・保額 ' + esc(s.amount) + " 萬</small></h2>" +
      '<div class="cmp-scroll"><table class="cmp q-ben"><thead><tr><th class="k">保障項目</th><th>給付金額</th></tr></thead><tbody>';
    h += brow("1", "首次罹患癌症（初期）或（輕度）",
      lines(["第1年度 " + yuan(c.year1Cancer), "第2年度起 " + yuan(c.early2)]),
      "第1保單年度按年繳保險費總和 × 1.06；第2保單年度起按保險金額 10%；以一次為限。如原位癌、第一期乳癌、第一期子宮頸癌、第一期大腸直腸癌等");
    h += brow("2", "首次罹患癌症（重度）",
      lines(["第1年度 " + yuan(c.year1Cancer), "第2年度起 " + yuan(c.sa)]),
      "第1保單年度按年繳保險費總和 × 1.06；第2保單年度起按保險金額 100%；已領初期／輕度者扣除後給付餘額；以一次為限", "accent");
    h += brow("3", "首次罹患特定癌症（重度）加給",
      lines([money.format(Math.round(c.sa * RULES.specificPct[2])) + "～" + yuan(c.specMax)]),
      "第2保單年度起，重度癌症且屬女性特定癌症（" + specList.join("、") + "）：第2年度 10%、第3年度 20%、第4年度 30%、第5年度 40%、第6年度起 50%；以一次為限", "accent");
    h += brow("4", "特定手術保險金", esc(yuan(c.surgery)),
      "因疾病或傷害接受條款附表二 14 項女性骨盆／尿失禁相關手術之一（如尿失禁手術、陰道懸吊術、子宮懸吊術、骨盆底重建術），保險金額 2%；以一次為限");
    h += brow("5", "特定傷病保險金", esc(yuan(c.illness)),
      "第2保單年度起首次確診嚴重全身性紅斑性狼瘡腎病變或嚴重類風濕性關節炎，保險金額 10%；以一項一次為限");
    h += brow("6", "豁免保險費", "免繳續期保費",
      "繳費期間內首次罹患癌症（重度），或意外致成一～六級失能：豁免診斷確定日後本契約續期應繳保費，契約繼續有效");
    h += brow("7", "身故保險金", lines(["第1年度 " + yuan(c.death1), "第" + c.termN + "年度起 " + yuan(c.maturity)]),
      "當年度保險金額＝年繳保險費總和 × 實際繳費年度數 × 1.06，扣除已申領之各項保險金");
    h += brow("8", "滿期保險金（保險年齡屆滿 " + c.endAge + " 歲）", esc(yuan(c.maturity)),
      "按當年度保險金額給付後契約終止；扣除已申領之各項保險金。本商品無解約金");
    h += "</tbody></table></div></section>";
    h += SPLIT; // 畫面上在此插入「圖像點選」區塊（PNG 不含）

    // ---- 罹癌情境 ----
    var y = c.claimYear;
    h += '<section class="q-frac"><h2 class="sec-title big">罹癌可領多少？<small>第 ' + y + " 保單年度首次診斷確定・符合條款定義</small></h2>" +
      '<div class="q-frac-grid">' +
      "<div><small>癌症（初期）／（輕度）</small><b>" + money.format(c.early) + "</b><span>元</span></div>" +
      "<div><small>癌症（重度）</small><b>" + money.format(c.severe) + "</b><span>元</span></div>" +
      "<div><small>特定癌症（重度）加給</small><b>" + (c.spec ? money.format(c.spec) : "—") + "</b>" + (c.spec ? "<span>元</span>" : "") + "</div>" +
      '<div class="tot"><small>女性特定癌症（重度）合計</small><b>' + money.format(c.severeSpec) + "</b><span>元</span></div>" +
      "</div><p>" + (y === 1
        ? "第1保單年度：初期／輕度與重度皆按年繳保險費總和（" + money.format(c.annualStd) + " 元）× 1.06；特定癌症加給自第2保單年度起。"
        : "初期／輕度按保險金額 10%、重度按保險金額 100%" + (c.spec ? "，女性特定癌症另加保險金額 " + pct(specificPct(y)) : "") + "。") +
      "先領初期／輕度、之後惡化為重度者，重度保險金扣除已領的初期／輕度後給付。" +
      (c.waiveYears > 0 ? "確診重度且在繳費期間內：豁免診斷確定日後續期保費（至少免繳第 " + (y + 1) + "～" + c.termN + " 年度，約 " + money.format(c.waived) + " 元）。" : "") +
      "等待期間 90 日內確診不給付。</p></section>";

    // ---- 保單年度利益 ----
    h += '<section class="cmp-card q-benefits q-years"><h2 class="sec-title big">保單年度利益<small>依官方建議書公式・單位：元</small></h2>' +
      '<div class="cmp-scroll"><table class="cmp q-yr"><thead><tr><th>年度</th><th>年齡</th><th>累計實繳<small>' + esc(c.pay.label) + "・含折扣</small></th>" +
      "<th>身故／滿期<small>當年度保險金額</small></th><th>初期／輕度</th><th>重度</th><th>特定癌症<small>重度加給</small></th></tr></thead><tbody>";
    c.years.forEach(function (r) {
      var last = r.year === c.coverYears;
      h += "<tr" + (last ? ' class="hl"' : "") + "><td>" + r.year + "</td><td>" + r.age + "</td><td>" + money.format(r.paid) +
        "</td><td>" + money.format(r.death) + (last ? "<small>滿期</small>" : "") + "</td><td>" + money.format(r.early) + "</td><td>" + money.format(r.severe) +
        "</td><td>" + (r.spec ? money.format(r.spec) : "—") + "</td></tr>";
    });
    h += '</tbody></table></div><p class="yr-note">累計實繳保費 ' + yuan(c.totalPaid) + "（" + c.termN + " 年繳費期滿）；滿期保險金 " + yuan(c.maturity) +
      "（第 " + c.coverYears + " 保單年度末，保險年齡屆滿 " + c.endAge + " 歲）。身故／滿期均扣除已申領之各項保險金；本商品無解約金。</p></section>";

    // ---- 試算依據與重要提醒 ----
    var notes = [
      "保費＝ROUND(保額（萬）× 年繳費率 " + c.rate + " 元／萬（保險年齡 " + c.age + " 歲・" + c.term + " 年期）, 1) × 繳別係數（半年 0.52、季 0.262、月 0.088）四捨五入；再扣繳費方式折扣後四捨五入。",
      "繳費方式折扣：首期匯款、金融機構轉帳、富邦信用卡、自行繳費（續期）享 1%；一般信用卡無折扣；主約折扣上限 1%。" + (c.pay.perYear === 12 ? "月繳首期須繳 2 個月（" + yuan(c.firstPay * 2) + "）。" : ""),
      "第一年實繳 " + yuan(c.year1Paid) + "，第2年度起每年 " + yuan(c.laterPaid) + "。" +
        (s.healthCheck ? "健康管理保險費折扣：第2保單年度起，於指定期間送交健康檢查報告者，次一保單年度續期保費再享 1%（每期 " + yuan(c.healthRenew) + "；繳費期內全部適用時累計實繳約 " + yuan(c.totalPaidHealth) + "）。" : "另有健康管理保險費折扣 1%（第2保單年度起、需於指定期間送健檢報告）。"),
      "投保規則：女性專屬；10 年期 18 足歲～60 歲、20 年期 18 足歲～50 歲；保額 50～300 萬（以萬元為單位）；與其他保額型癌症險累計最高 500 萬；不得附加防癌險附約。",
      "癌症保險金須於等待期間（生效日起 90 日）屆滿後或復效日起經病理檢驗確定；投保前、停效期間或等待期間內已確診癌症者不給付。初期／輕度、重度、特定癌症（重度）各以一次為限。",
      "「年繳保險費總和」以年繳標準體費率計算（與實際繳別、折扣無關）；第1年度罹癌給付＝保額（萬）× 費率 × 1.06。"
    ];
    notes.push("本頁僅供試算；實際承保、保費與理賠，以保單條款、正式建議書及富邦人壽審核為準。");
    h += '<section class="notes-wrap"><h2 class="sec-title big">試算依據與重要提醒</h2><ul class="notes">' +
      notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></section>";
    return h;
  }

  function footerHtml() {
    var a = currentAgent();
    return '<div class="sig-wrap"><img class="sig-logo" src="' + LOGO + '" alt="富邦人壽 南方通訊處" width="88" height="88">' +
      '<div class="sig-text"><div class="sig-kicker">您的專屬保險顧問</div>' +
      '<div class="sig-name">' + esc(AP.line(a)) + "</div>" +
      (a.name ? '<div class="sig-unit">' + esc(AP.ORG) + "</div>" : "") + "</div>" +
      (AP.telDigits(a.phone) ? '<a class="sig-phone" href="' + esc(AP.telHref(a.phone)) + '">☎ ' + esc(a.phone) + "</a>" : "") + "</div>" +
      '<div class="sig-disc">以上保費為試算結果，實際以富邦人壽核保為準；保障內容以保單條款為準。</div>';
  }

  function render() {
    var s = state, c = compute(s);
    syncText($("name"), s.name);
    syncText($("rocBirth"), s.rocBirth);
    $("payMode").value = s.payMode;
    $("term").value = s.term;
    syncNumber($("amount"), s.amount);
    $("firstMethod").value = s.firstMethod;
    $("renewMethod").value = s.renewMethod;
    $("healthCheck").checked = !!s.healthCheck;
    syncNumber($("claimYear"), s.claimYear);
    if (c.coverYears) $("claimYear").max = String(c.coverYears);

    var p = parseRocBirth(s.rocBirth);
    $("ageNote").textContent = p && p.age >= 0 ? "足歲 " + p.exactAge + " 歲・保險年齡 " + p.age + " 歲（費率依保險年齡）" : "";
    showText($("ageError"), c.ageError);
    showText($("amountError"), c.amountError);

    var parts = quoteHtml(c, s).split(SPLIT);
    $("quoteCard").innerHTML = parts[0];
    $("quoteCard2").innerHTML = parts[1] || "";
    $("quoteCard2").hidden = !parts[1];
    if (window.BodyMap) window.BodyMap.update(c, s);
    $("sigFooter").innerHTML = footerHtml();
    if (!clientMode) saveDraft();
  }

  /* ---- 草稿（localStorage）與客戶頁連結（#q=，資料全在網址、不經伺服器） ---- */
  function pickState(o) {
    var out = JSON.parse(JSON.stringify(R.DEFAULTS));
    if (o && typeof o === "object") STATE_KEYS.forEach(function (k) {
      if (o[k] !== undefined && typeof o[k] === typeof R.DEFAULTS[k]) out[k] = o[k];
    });
    if (!R.PAY_MODES[out.payMode]) out.payMode = R.DEFAULTS.payMode;
    if (RULES.terms.indexOf(out.term) < 0) out.term = R.DEFAULTS.term;
    if (!R.PAY_METHODS.first[out.firstMethod]) out.firstMethod = R.DEFAULTS.firstMethod;
    if (!R.PAY_METHODS.renew[out.renewMethod]) out.renewMethod = R.DEFAULTS.renewMethod;
    if (["cancer", "surgery", "illness"].indexOf(out.mapTab) < 0) out.mapTab = R.DEFAULTS.mapTab;
    if (window.BodyMap && !window.BodyMap.isValid(out.mapTab, out.mapItem)) out.mapItem = window.BodyMap.DEFAULT_ITEM[out.mapTab];
    return out;
  }
  var saveTimer;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }, 250);
  }
  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    var bin = atob(str), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function shareUrl() {
    var u = new URL(location.href); u.search = ""; u.hash = "";
    var payload = Object.assign({}, state, { agent: AP.sanitize(AP.load()) });
    return u.href + "#q=" + b64urlEncode(JSON.stringify(payload));
  }
  function stateFromHash() {
    var m = /[#&]q=([^&]+)/.exec(location.hash || "");
    if (!m) return null;
    try {
      var o = JSON.parse(b64urlDecode(m[1]));
      linkAgent = (o && o.agent && typeof o.agent === "object") ? AP.sanitize(o.agent) : null;
      return pickState(o);
    } catch (e) { return null; }
  }
  function agentReminder() {
    var a = AP.load(), m = AP.missing(a), smp = AP.isSample(a);
    if (!m.length && !smp) return "";
    var card = $("agentCard");
    if (card) { card.classList.add("flash"); setTimeout(function () { card.classList.remove("flash"); }, 1600); }
    return smp ? "⚠ 業務員資料仍是範例（" + AP.SAMPLE.name + "）" : "⚠ 尚未填寫業務員" + m.join("、") + "，客戶只會看到「富邦人壽 南方通訊處」";
  }
  function toast(msg) {
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  }
  function copyText(txt) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  /* ---- 下載保障彙整圖（html2canvas；780px 寬 × 2 倍） ---- */
  function downloadPng() {
    if (!window.html2canvas) { alert("缺少 html2canvas 元件"); return Promise.resolve(); }
    var host = document.createElement("div");
    host.className = "png-host";
    host.innerHTML = '<div class="png-root clx-body" id="pngRoot"><div class="quote-wrap">' + quoteHtml(compute(state), state) + '</div><footer class="site-footer">' + footerHtml() + "</footer></div>";
    document.body.appendChild(host);
    var root = host.querySelector("#pngRoot");
    var imgs = Array.prototype.slice.call(root.querySelectorAll("img"));
    var ready = Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); }));
    return ready.then(function () {
      return window.html2canvas(root, { scale: 2, backgroundColor: "#eef6f7", useCORS: true, logging: false, width: 780, windowWidth: 780 });
    }).then(function (canvas) {
      var d = new Date(), ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
      var name = "真馨相守CLX_" + (state.name || "客戶").replace(/[\\/:*?"<>|\s]/g, "") + "_" + ymd + ".png";
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          resolve(name);
        }, "image/png");
      });
    }).finally(function () { host.remove(); });
  }

  /* ---------------- 事件綁定 ---------------- */
  function clampNum(v, min, max) { return Math.min(max, Math.max(min, Number(v))); }

  function init() {
    fillOptions($("payMode"), Object.keys(R.PAY_MODES).map(function (k) { return [k, R.PAY_MODES[k].label]; }));
    fillOptions($("term"), RULES.terms.map(function (t) { return [t, t + " 年期"]; }));
    fillOptions($("firstMethod"), Object.keys(R.PAY_METHODS.first).map(function (k) { return [k, R.PAY_METHODS.first[k].label]; }));
    fillOptions($("renewMethod"), Object.keys(R.PAY_METHODS.renew).map(function (k) { return [k, R.PAY_METHODS.renew[k].label]; }));
    $("amount").min = String(RULES.min); $("amount").max = String(RULES.max);

    var fromHash = stateFromHash();
    if (fromHash) {
      state = fromHash; clientMode = true;
      document.body.classList.add("is-client");
      document.title = (state.name ? state.name + " 的" : "") + "真馨相守 CLX 女性防癌保障試算｜" + AP.line(currentAgent());
    } else {
      AP.bind({ name: $("agentName"), title: $("agentTitle"), phone: $("agentPhone"), list: $("agentTitleList"),
        sample: $("agentSample"), status: $("agentStatus"), card: $("agentCard"), onChange: function () { render(); } });
      try { var raw = localStorage.getItem(STORE_KEY); if (raw) state = pickState(JSON.parse(raw)); } catch (e) {}
    }

    function on(id, ev, fn) { $(id).addEventListener(ev, function (e) { fn(e.target); render(); }); }
    on("name", "input", function (t) { state.name = t.value; });
    on("rocBirth", "input", function (t) { state.rocBirth = t.value; });
    on("payMode", "change", function (t) { state.payMode = t.value; });
    on("term", "change", function (t) { state.term = t.value; });
    on("amount", "input", function (t) { state.amount = t.value === "" ? 0 : clampNum(t.value, 0, RULES.max); });
    on("amount", "blur", function () { state.amount = Math.round(clampNum(state.amount, RULES.min, RULES.max)); }); // 離開欄位：補到 50 萬、取整數萬元
    on("firstMethod", "change", function (t) { state.firstMethod = t.value; });
    on("renewMethod", "change", function (t) { state.renewMethod = t.value; });
    on("healthCheck", "change", function (t) { state.healthCheck = t.checked; });
    on("claimYear", "input", function (t) { if (t.value !== "") state.claimYear = Math.max(1, Math.floor(Number(t.value)) || 1); });
    on("claimYear", "blur", function () { state.claimYear = compute(state).claimYear || 1; });

    $("btnPng").addEventListener("click", function () {
      var b = $("btnPng"); b.disabled = true; b.textContent = "產生中…";
      var remind = agentReminder();
      downloadPng().then(function (n) { if (n) toast(remind ? remind + "（已下載 " + n + "）" : "已下載 " + n); })
        .catch(function (err) { alert("產生圖片失敗：" + (err && err.message ? err.message : err)); })
        .finally(function () { b.disabled = false; b.textContent = "🖼 下載保障彙整圖"; });
    });
    $("btnCopyLink").addEventListener("click", function () {
      var url = shareUrl(), remind = agentReminder();
      copyText(url).then(function () {
        toast(remind ? remind + "（連結已複製）" : /^file:/.test(location.href) ? "已複製（本機檔案連結僅供自己預覽；上線後的連結才能傳給客戶）" : "已複製客戶頁連結，可貼到 LINE");
      }).catch(function () { prompt("請複製以下連結：", url); });
    });
    $("btnOpenClient").addEventListener("click", function () { var r = agentReminder(); if (r) toast(r); window.open(shareUrl(), "_blank"); });
    $("btnReset").addEventListener("click", function () {
      if (!confirm("恢復預設示範資料？（目前輸入會被覆蓋）")) return;
      state = JSON.parse(JSON.stringify(R.DEFAULTS)); render(); toast("已恢復預設");
    });
    window.addEventListener("hashchange", function () { if (/[#&]q=/.test(location.hash)) location.reload(); });
    if (window.BodyMap) window.BodyMap.init({ root: $("bodyMap"), setState: function (o) { state = pickState(Object.assign({}, state, o)); render(); } });
    render();
  }

  window.QuoteCalc = { parseRocBirth: parseRocBirth, compute: compute, getState: function () { return state; },
    setState: function (o) { state = pickState(Object.assign({}, state, o)); render(); return compute(state); },
    rates: R, shareUrl: shareUrl, downloadPng: downloadPng, getAgent: function () { return currentAgent(); } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
