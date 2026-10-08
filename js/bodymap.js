/* =====================================================================
 * bodymap.js ── 真馨相守 CLX「圖像點選」：特定癌症／特定手術／特定傷病（南方通訊處 115/10/08 clx2）
 * ---------------------------------------------------------------------
 * ‧ 人形與骨盆腔示意圖為自繪 inline SVG（醫療資訊圖風格、非寫實）。
 * ‧ 項目名稱一律取自 rates.js（條款 CLX1150210 附表一、附表二、第二條；商品內容說明 115/01/23）；
 *   給付金額一律取自 app.js compute() 的結果（c），本檔不自行計算費率或比例。
 * ‧ 對外：window.BodyMap.init(opts)、BodyMap.update(c, state)、BodyMap.isValid(tab, item)。
 * ===================================================================== */
(function () {
  "use strict";

  var R = window.QUOTE_RATES;
  var RULES = R.RULES;
  var money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

  function cancerName(code) {
    for (var i = 0; i < R.SPECIFIC_CANCERS.length; i++) if (R.SPECIFIC_CANCERS[i][0] === code) return R.SPECIFIC_CANCERS[i][1];
    return code;
  }

  /* ---- 部位 ↔ 條款項目對照 ---- */
  var TABS = [
    { id: "cancer", label: "特定癌症", icon: "🎗" },
    { id: "surgery", label: "特定手術", icon: "🩺" },
    { id: "illness", label: "特定傷病", icon: "🫘" }
  ];
  var ITEMS = {
    cancer: [
      { id: "breast", label: "乳房", codes: ["C50"], mild: "breast", plain: "乳房的惡性腫瘤（乳癌）。" },
      { id: "cervix", label: "子宮頸", codes: ["C53"], mild: "cervix", plain: "子宮頸（子宮下端、與陰道相接處）的惡性腫瘤。" },
      { id: "uterus", label: "子宮", codes: ["C54", "C55"], plain: "子宮體（子宮本體）或未明示部位的子宮惡性腫瘤。" },
      { id: "ovary", label: "卵巢", codes: ["C56"], mild: "ovary", plain: "卵巢的惡性腫瘤（卵巢癌）。" },
      { id: "other", label: "其他女性生殖器官", codes: ["C57"],
        plain: "附表一沒有單獨列名的其他女性生殖器官（例如輸卵管）或未明示部位的女性生殖器官惡性腫瘤；是否屬於本項，以醫師診斷的 ICD 代碼為準。",
        flag: "圖上以輸卵管位置示意；條款僅寫「其他及未明示女性生殖器官」，未列舉器官。" },
      { id: "vagina", label: "陰道", codes: ["C52"], plain: "陰道的惡性腫瘤。" },
      { id: "vulva", label: "外陰", codes: ["C51"], plain: "外陰部的惡性腫瘤。" },
      { id: "placenta", label: "胎盤", codes: ["C58"], plain: "胎盤的惡性腫瘤。" },
      { id: "skin", label: "皮膚", codes: ["C43", "C44"], mild: "skin", plain: "全身皮膚的惡性腫瘤，包括皮膚惡性黑色素瘤及其他皮膚癌（圖上以手臂示意，實際不限部位）。" }
    ],
    surgery: [
      { id: "urinary", label: "膀胱・尿道", sub: "尿失禁相關", nums: [1, 2, 3, 5, 6, 7, 8],
        plain: "改善漏尿（尿失禁）、支撐膀胱或尿道的手術。",
        flag: "「KELLY手術」條款未寫明部位；因附表二第 3 項「陰道式尿失禁手術（含Kelly plication）」屬尿失禁手術，歸入本組。第 1 項雖可經陰道進行，處理部位為尿道，亦歸入本組。" },
      { id: "vaginal", label: "陰道", sub: "懸吊・固定・網膜修復", nums: [4, 9, 10, 11, 13],
        plain: "支撐或固定陰道位置（懸吊、固定），以及修復陰道人工網膜外露的手術。" },
      { id: "uterine", label: "子宮", sub: "懸吊", nums: [14], plain: "將子宮懸吊、固定於正常位置的手術。" },
      { id: "pelvicfloor", label: "其他骨盆腔", sub: "骨盆底", nums: [12],
        plain: "重建支撐骨盆腔器官的骨盆底（經腹腔進行）。",
        flag: "骨盆底不屬單一器官，依指示歸入「其他骨盆腔」。" }
    ],
    illness: [
      { id: "kidney", label: "腎臟", ill: 0, def: "lupus", plain: "紅斑性狼瘡侵犯腎臟，腎臟切片證實為 WHO 狼瘡性腎炎第三～六級並合併蛋白尿。" },
      { id: "joints", label: "重要關節", ill: 1, def: "ra", plain: "類風濕性關節炎造成 3 個以上重要關節破壞變形、失去機能，且日常生活 6 項中有 3 項以上需他人協助。" }
    ]
  };
  /* 人形圖「骨盆腔」框：選到放大圖上的任一部位時一起標亮 */
  var PELVIC = { cancer: ["uterus", "placenta", "cervix", "ovary", "other", "vagina", "vulva"], surgery: ["urinary", "vaginal", "uterine", "pelvicfloor"] };
  var DEFAULT_ITEM = { cancer: "breast", surgery: "urinary", illness: "kidney" };

  function findItem(tab, id) {
    var list = ITEMS[tab] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function isValid(tab, id) { return !!findItem(tab, id); }

  /* ---------------- SVG（自繪；viewBox 單位） ---------------- */
  function hs(tab, item, label, inner, extra) {
    return '<g class="hs' + (extra ? " " + extra : "") + '" data-tab="' + tab + '" data-item="' + item + '" tabindex="0" role="button" aria-label="' + label + '">' + inner + "</g>";
  }
  var BODY_SVG =
    '<svg class="bm-body" viewBox="0 0 300 500" role="group" aria-label="女性人形示意圖">' +
    '<defs><linearGradient id="bmSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf3f7"/><stop offset="1" stop-color="#d9e9f0"/></linearGradient></defs>' +
    '<g class="bm-silhouette">' +
      '<path class="hair" d="M122,52 C116,20 138,8 152,9 C174,10 184,28 178,54 C181,66 179,78 174,86 L168,66 C170,46 160,32 148,32 C134,33 127,46 129,66 L124,86 C119,76 119,64 122,52Z"/>' +
      '<ellipse class="fill" cx="150" cy="47" rx="25" ry="29"/>' +
      '<rect class="fill" x="140" y="70" width="20" height="32" rx="8"/>' +
      '<path class="limb" d="M104,112 C88,140 82,180 78,215 C74,245 68,270 64,292"/>' +
      '<path class="limb" d="M196,112 C212,140 218,180 222,215 C226,245 232,270 236,292"/>' +
      '<circle class="fill" cx="62" cy="303" r="12"/><circle class="fill" cx="238" cy="303" r="12"/>' +
      '<path class="fill" d="M108,100 C126,94 174,94 192,100 C206,105 212,116 210,130 L202,190 C198,212 186,226 186,240 C190,262 202,280 200,300 C198,318 180,330 150,332 C120,330 102,318 100,300 C98,280 110,262 114,240 C114,226 102,212 98,190 L90,130 C88,116 94,105 108,100Z"/>' +
      '<path class="fill" d="M104,296 C108,350 116,390 120,420 C122,450 122,470 124,484 L142,484 C142,460 144,430 146,400 C148,370 148,340 150,324 Z"/>' +
      '<path class="fill" d="M196,296 C192,350 184,390 180,420 C178,450 178,470 176,484 L158,484 C158,460 156,430 154,400 C152,370 152,340 150,324 Z"/>' +
      '<ellipse class="fill" cx="131" cy="488" rx="15" ry="6"/><ellipse class="fill" cx="169" cy="488" rx="15" ry="6"/>' +
      '<path class="contour" d="M118,152 C124,168 142,170 148,154 M152,154 C158,170 176,168 182,152"/>' +
    "</g>" +
    // 特定癌症：乳房、皮膚、骨盆腔
    hs("cancer", "breast", "乳房（特定癌症）",
      '<circle class="vis" cx="132" cy="152" r="15"/><circle class="vis" cx="168" cy="152" r="15"/>' +
      '<path class="lead" d="M184,146 L236,128"/><text class="lbl" x="240" y="132">乳房</text>' +
      '<rect class="hit" x="106" y="124" width="88" height="54" rx="14"/>') +
    hs("cancer", "skin", "皮膚（特定癌症）",
      '<circle class="vis ring" cx="79" cy="212" r="14"/><ellipse class="mole" cx="79" cy="212" rx="4.5" ry="3.5"/>' +
      '<path class="lead" d="M66,206 L44,186"/><text class="lbl" x="40" y="180" text-anchor="end">皮膚</text>' +
      '<circle class="hit" cx="79" cy="212" r="28"/>') +
    hs("cancer", "uterus", "骨盆腔：見放大圖（子宮）", pelvisBox(), "hs-pelvis") +
    // 特定手術：骨盆腔
    hs("surgery", "urinary", "骨盆腔：見放大圖（膀胱・尿道）", pelvisBox(), "hs-pelvis") +
    // 特定傷病：腎臟、關節
    hs("illness", "kidney", "腎臟（嚴重全身性紅斑性狼瘡腎病變）",
      '<path class="vis" d="M136,198 C124,196 118,208 120,220 C122,232 132,236 138,228 C134,220 134,212 140,206 C142,202 140,199 136,198Z"/>' +
      '<path class="vis" d="M164,198 C176,196 182,208 180,220 C178,232 168,236 162,228 C166,220 166,212 160,206 C158,202 160,199 164,198Z"/>' +
      '<path class="lead" d="M182,214 L238,214"/><text class="lbl" x="242" y="218">腎臟</text>' +
      '<rect class="hit" x="108" y="190" width="84" height="52" rx="14"/>') +
    hs("illness", "joints", "重要關節（嚴重類風濕性關節炎）",
      joint(150, 88) + joint(81, 186) + joint(219, 186) + joint(64, 286) + joint(236, 286) + joint(62, 304) + joint(238, 304) +
      joint(133, 410) + joint(167, 410) + joint(131, 472) + joint(169, 472) + joint(131, 488) + joint(169, 488) +
      '<path class="lead" d="M70,286 L30,262"/><text class="lbl" x="26" y="252" text-anchor="end">重要</text><text class="lbl" x="26" y="268" text-anchor="end">關節</text>' +
      hit(150, 88) + hit(81, 186) + hit(219, 186) + hit(63, 295) + hit(237, 295) + hit(133, 410) + hit(167, 410) + hit(131, 480) + hit(169, 480)) +
    "</svg>";
  function pelvisBox() {
    return '<rect class="vis box" x="114" y="258" width="72" height="56" rx="18"/>' +
      '<path class="mini" d="M138,272 C138,266 162,266 162,272 C163,284 156,292 152,298 L148,298 C144,292 137,284 138,272Z"/>' +
      '<path class="lead" d="M188,286 L226,300"/><text class="lbl" x="230" y="298">骨盆腔</text><text class="lbl sm" x="230" y="314">見放大圖</text>' +
      '<rect class="hit" x="112" y="256" width="76" height="60" rx="18"/>';
  }
  function joint(x, y) { return '<circle class="vis dot" cx="' + x + '" cy="' + y + '" r="6"/>'; }
  function hit(x, y) { return '<circle class="hit" cx="' + x + '" cy="' + y + '" r="26"/>'; }

  // 骨盆腔正面示意（特定癌症）
  var FRONT_SVG =
    '<svg class="bm-pelvis bm-front" viewBox="0 0 360 330" role="group" aria-label="骨盆腔正面示意圖（特定癌症）">' +
    '<text class="cap" x="14" y="22">骨盆腔・正面示意</text>' +
    '<text class="lbl sm" x="180" y="46" text-anchor="middle">其他女性生殖器官（如輸卵管）</text>' +
    hs("cancer", "other", "其他女性生殖器官（特定癌症）",
      '<path class="vis tube" d="M142,78 C120,62 96,64 84,84 C78,94 74,104 70,110 M218,78 C240,62 264,64 276,84 C282,94 286,104 290,110"/>' +
      '<path class="hit-stroke" d="M142,78 C120,62 96,64 84,84 C78,94 74,104 70,110 M218,78 C240,62 264,64 276,84 C282,94 286,104 290,110"/>' +
      '<rect class="hit" x="120" y="30" width="120" height="24" rx="10"/>') +
    hs("cancer", "uterus", "子宮（特定癌症）",
      '<path class="vis organ" d="M140,74 C140,58 220,58 220,74 C224,112 208,146 194,166 L166,166 C152,146 136,112 140,74Z"/>' +
      '<path class="lead" d="M206,146 L252,206"/><text class="lbl" x="256" y="212">子宮</text>' +
      '<rect class="hit" x="248" y="192" width="50" height="30" rx="10"/>') +
    hs("cancer", "placenta", "胎盤（特定癌症）",
      '<ellipse class="vis placenta" cx="180" cy="100" rx="21" ry="15"/><text class="lbl in" x="180" y="104" text-anchor="middle">胎盤</text>' +
      '<circle class="hit" cx="180" cy="100" r="24"/>') +
    hs("cancer", "ovary", "卵巢（特定癌症）",
      '<ellipse class="vis organ" cx="82" cy="130" rx="22" ry="15"/><ellipse class="vis organ" cx="278" cy="130" rx="22" ry="15"/>' +
      '<text class="lbl" x="82" y="166" text-anchor="middle">卵巢</text><text class="lbl" x="278" y="166" text-anchor="middle">卵巢</text>' +
      '<circle class="hit" cx="82" cy="136" r="27"/><circle class="hit" cx="278" cy="136" r="27"/>') +
    hs("cancer", "cervix", "子宮頸（特定癌症）",
      '<path class="vis organ" d="M166,166 L194,166 C196,176 196,188 192,196 L168,196 C164,188 164,176 166,166Z"/>' +
      '<path class="lead" d="M162,182 L112,186"/><text class="lbl" x="108" y="190" text-anchor="end">子宮頸</text>' +
      '<rect class="hit" x="144" y="158" width="72" height="44" rx="10"/><rect class="hit" x="56" y="172" width="58" height="26" rx="10"/>') +
    hs("cancer", "vagina", "陰道（特定癌症）",
      '<path class="vis organ soft" d="M168,198 L192,198 C194,222 194,244 196,262 L164,262 C166,244 166,222 168,198Z"/>' +
      '<path class="lead" d="M162,232 L112,236"/><text class="lbl" x="108" y="240" text-anchor="end">陰道</text>' +
      '<rect class="hit" x="144" y="202" width="72" height="60" rx="10"/><rect class="hit" x="66" y="222" width="48" height="26" rx="10"/>') +
    hs("cancer", "vulva", "外陰（特定癌症）",
      '<path class="vis organ soft" d="M148,284 C152,272 208,272 212,284 C212,296 196,304 180,304 C164,304 148,296 148,284Z"/>' +
      '<path class="lead" d="M146,288 L112,292"/><text class="lbl" x="108" y="296" text-anchor="end">外陰</text>' +
      '<rect class="hit" x="130" y="266" width="100" height="46" rx="12"/><rect class="hit" x="66" y="278" width="48" height="26" rx="10"/>') +
    "</svg>";

  // 骨盆腔側面示意（特定手術）：左＝腹側（前）、右＝背側（後）
  var SIDE_SVG =
    '<svg class="bm-pelvis bm-side" viewBox="0 0 360 340" role="group" aria-label="骨盆腔側面示意圖（特定手術）">' +
    '<text class="cap" x="14" y="22">骨盆腔・側面示意</text>' +
    '<text class="dir" x="14" y="42">← 腹側</text><text class="dir" x="346" y="42" text-anchor="end">背側 →</text>' +
    '<path class="bone" d="M306,70 C334,128 334,206 300,266"/>' +
    '<ellipse class="bone-f" cx="86" cy="236" rx="15" ry="22"/><text class="dir" x="86" y="274" text-anchor="middle">恥骨</text>' +
    '<path class="rectum" d="M268,118 C282,170 278,232 252,296"/><text class="dir" x="292" y="200">直腸</text>' +
    hs("surgery", "pelvicfloor", "骨盆底（其他骨盆腔・特定手術）",
      '<path class="vis floor" d="M92,302 C150,322 230,324 300,290"/>' +
      '<path class="hit-stroke" d="M92,302 C150,322 230,324 300,290"/>' +
      '<text class="lbl" x="210" y="334" text-anchor="middle">骨盆底（其他骨盆腔）</text>') +
    hs("surgery", "urinary", "膀胱・尿道（特定手術）",
      '<path class="vis bladder" d="M88,190 C82,150 122,130 152,140 C178,148 184,180 172,206 C162,224 134,232 114,226 C98,222 90,208 88,190Z"/>' +
      '<path class="vis urethra" d="M120,226 C116,246 110,266 102,292"/>' +
      '<text class="lbl" x="22" y="126">膀胱</text><text class="lbl" x="22" y="142">・尿道</text><path class="lead" d="M66,136 L94,160"/>' +
      '<path class="hit-stroke" d="M120,226 C116,246 110,266 102,292"/><path class="hit" d="M88,190 C82,150 122,130 152,140 C178,148 184,180 172,206 C162,224 134,232 114,226 C98,222 90,208 88,190Z"/>' +
      '<rect class="hit" x="16" y="108" width="62" height="42" rx="10"/>') +
    hs("surgery", "uterine", "子宮（特定手術）",
      '<path class="vis organ" d="M152,128 C142,100 172,74 208,80 C238,86 252,110 246,134 C242,152 232,166 224,182 L206,176 C198,160 188,150 172,144 C162,140 154,136 152,128Z"/>' +
      '<text class="lbl" x="206" y="66" text-anchor="middle">子宮</text>' +
      '<path class="hit" d="M152,128 C142,100 172,74 208,80 C238,86 252,110 246,134 C242,152 232,166 224,182 L206,176 C198,160 188,150 172,144 C162,140 154,136 152,128Z"/>' +
      '<rect class="hit" x="180" y="50" width="52" height="24" rx="10"/>') +
    hs("surgery", "vaginal", "陰道（特定手術）",
      '<path class="vis vag" d="M212,180 C202,216 186,252 164,292"/>' +
      '<path class="lead" d="M200,240 L236,244"/><text class="lbl" x="240" y="248">陰道</text>' +
      '<path class="hit-stroke" d="M212,180 C202,216 186,252 164,292"/><rect class="hit" x="232" y="230" width="44" height="26" rx="10"/>') +
    "</svg>";

  /* ---------------- 畫面 ---------------- */
  var root, opts, lastC = null, lastS = null;

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function yuan(v) { return money.format(v) + " 元"; }
  function pct(v) { return Math.round(v * 1000) / 10 + "%"; }

  function skeleton() {
    return '<h2 class="sec-title big">圖像點選・看懂保障<small>點圖上部位或下方按鈕，看條款項目與本方案給付</small></h2>' +
      '<div class="bm-tabs" role="tablist" aria-label="保障類別">' +
      TABS.map(function (t) {
        return '<button type="button" role="tab" class="bm-tab" id="bmTab-' + t.id + '" data-tab="' + t.id + '" aria-controls="bmPanel">' +
          '<span aria-hidden="true">' + t.icon + "</span>" + t.label + "</button>";
      }).join("") + "</div>" +
      '<div class="bm-panel" id="bmPanel" role="tabpanel">' +
        '<div class="bm-stage">' +
          '<div class="bm-fig bm-fig-body">' + BODY_SVG + "</div>" +
          '<div class="bm-fig bm-fig-front">' + FRONT_SVG + "</div>" +
          '<div class="bm-fig bm-fig-side">' + SIDE_SVG + "</div>" +
        "</div>" +
        '<div class="bm-side">' +
          '<div class="bm-chips" role="group" aria-label="部位"></div>' +
          '<div class="bm-detail" id="bmDetail" aria-live="polite"></div>' +
        "</div>" +
      "</div>";
  }

  function chipsHtml(tab, active) {
    return ITEMS[tab].map(function (it) {
      return '<button type="button" class="bm-chip' + (it.id === active ? " is-active" : "") + '" data-item="' + it.id + '" aria-pressed="' + (it.id === active) + '">' +
        esc(it.label) + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</button>";
    }).join("");
  }

  function yearStrip(c, valueAt, active) {
    var ys = [1, 2, 3, 4, 5, 6];
    return '<div class="bm-years" role="group" aria-label="診斷確定的保單年度">' + ys.map(function (y) {
      var on = y === 6 ? active >= 6 : active === y;
      return '<button type="button" class="bm-year' + (on ? " is-active" : "") + '" data-year="' + y + '" aria-pressed="' + on + '">' +
        "<small>第 " + y + (y === 6 ? "+" : "") + " 年度</small><b>" + money.format(valueAt(y)) + "</b></button>";
    }).join("") + "</div>";
  }

  function detailHtml(tab, it, c) {
    var h = '<div class="bm-d-head"><span class="bm-d-tag">' + (tab === "cancer" ? "特定癌症（重度）" : tab === "surgery" ? "特定手術" : "特定傷病") + "</span>" +
      "<h3>" + esc(it.label) + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</h3></div>";
    var ok = c && c.ok;
    var y = ok ? c.claimYear : 0;

    if (tab === "cancer") {
      if (ok) {
        var row = c.cancerByYear[Math.min(y, 6) - 1];
        h += '<div class="bm-pay"><small>第 ' + y + " 保單年度確診「癌症（重度）」</small><b>" + yuan(row.severe + row.spec) + "</b>" +
          "<span>" + (y === 1
            ? "第1保單年度：年繳保險費總和 " + money.format(c.annualStd) + " 元 × 1.06；特定癌症加給自第2保單年度起"
            : "癌症（重度）保險金 " + money.format(row.severe) + "（保額 100%）＋ 特定癌症（重度）保險金 " + money.format(row.spec) + "（保額 " + pct(row.specPct) + "）") +
          "</span></div>";
        h += yearStrip(c, function (yy) { var r = c.cancerByYear[yy - 1]; return r.severe + r.spec; }, y);
        var mild = (R.EARLY_MILD[it.mild] || []).concat(R.EARLY_MILD.all);
        h += '<p class="bm-mild">若屬癌症（初期）或（輕度），第 ' + y + " 保單年度改領 <b>" + yuan(row.early) + "</b>" +
          "（" + (y === 1 ? "年繳保險費總和 × 1.06" : "保額 10%") + "）；之後惡化為重度，重度保險金扣除已領部分後給付。</p>";
        h += '<ul class="bm-mildlist">' + mild.map(function (m) {
          return '<li><span class="t ' + (m[0] === "初期" ? "t1" : "t2") + '">癌症（' + m[0] + "）</span>" + esc(m[1]) + "</li>";
        }).join("") + "</ul>";
      } else h += '<p class="bm-wait">請先在左側完成正確的投保條件，這裡會顯示本方案的給付金額。</p>';
      h += "<h4>條款附表一 項目名稱</h4><ul class=\"bm-names\">" + it.codes.map(function (code) {
        return "<li><code>" + code + "</code>" + esc(cancerName(code)) + "</li>";
      }).join("") + "</ul>";
      h += "<h4>白話說明</h4><p>" + esc(it.plain) + "經病理檢驗確定為「癌症（重度）」（即癌症（初期）和癌症（輕度）以外之癌症）且屬本項時，除首次罹患癌症（重度）保險金外，第2保單年度起另給付首次罹患特定癌症（重度）保險金（第2年度 10%，逐年增加至第6年度起 50%），各以一次為限。</p>";
      h += '<ul class="bm-notes"><li>須於等待期間（生效日起 90 日）屆滿後或復效日起經病理檢驗確定；投保前、停效期間或等待期間內已確診癌症者不給付。</li>' +
        (ok && c.waiveYears > 0 ? "<li>繳費期間內確診癌症（重度）：豁免診斷確定日後本契約續期保費（至少免繳第 " + (y + 1) + "～" + c.termN + " 年度，約 " + yuan(c.waived) + "）。</li>" : "") +
        (it.flag ? '<li class="flag">' + esc(it.flag) + "</li>" : "") + "</ul>";
    } else if (tab === "surgery") {
      if (ok) h += '<div class="bm-pay"><small>接受下列任一項特定手術</small><b>' + yuan(c.surgery) + "</b><span>當時保險金額 " + money.format(c.sa) + " 元 × 2%</span></div>";
      else h += '<p class="bm-wait">請先在左側完成正確的投保條件，這裡會顯示本方案的給付金額。</p>';
      h += "<h4>條款附表二 項目名稱</h4><ol class=\"bm-names bm-surg\">" + it.nums.map(function (n) {
        return '<li><code>' + n + "</code><span>" + esc(R.SPECIFIC_SURGERIES[n - 1]) + "<small>" + esc(R.SPECIFIC_SURGERIES_EN[n - 1]) + "</small></span></li>";
      }).join("") + "</ol>";
      h += "<h4>白話說明</h4><p>" + esc(it.plain) + "因疾病或傷害，經醫師診斷必須於醫院或診所接受附表二所列特定手術項目之一治療且已實際接受者，按當時保險金額的 2% 給付。</p>";
      h += '<ul class="bm-notes"><li>附表二共 14 項；不論同時或先後接受二項（含）以上，僅給付其中一項；同項手術發生二次（含）以上，僅給付一次。</li>' +
        "<li>「疾病」係指生效日起持續有效 30 日以後或復效日起所發生之疾病。</li>" +
        (it.flag ? '<li class="flag">' + esc(it.flag) + "</li>" : "") + "</ul>";
    } else {
      if (ok) {
        h += '<div class="bm-pay"><small>第 ' + y + " 保單年度首次確診</small><b>" + (y >= 2 ? yuan(c.illness) : "不給付") + "</b><span>" +
          (y >= 2 ? "診斷確定時保險金額 " + money.format(c.sa) + " 元 × 10%" : "須於第2保單年度（含）以後首次確診；第2年度起可領 " + yuan(c.illness)) + "</span></div>";
      } else h += '<p class="bm-wait">請先在左側完成正確的投保條件，這裡會顯示本方案的給付金額。</p>';
      h += "<h4>條款第二條 項目名稱與定義</h4><ul class=\"bm-names\"><li><code>" + (it.ill + 1) + "</code>" + esc(R.SPECIFIC_ILLNESSES[it.ill]) + "</li></ul>" +
        '<p class="bm-def">「' + esc(R.SPECIFIC_ILLNESSES[it.ill]) + "」：" + esc(R.ILLNESS_DEFS[it.def]) + "</p>";
      h += "<h4>白話說明</h4><p>" + esc(it.plain) + "</p>";
      h += '<ul class="bm-notes"><li>二項特定傷病不論同時或先後罹患，僅給付其中一項；同項發生二次（含）以上，僅給付一次。</li></ul>';
    }
    return h;
  }

  function select(tab, item, fromUser) {
    opts.setState({ mapTab: tab, mapItem: item });
    if (fromUser) {
      var d = root.querySelector(".bm-detail");
      var r = d && d.getBoundingClientRect();
      if (r && (r.top > window.innerHeight - 80 || r.bottom < 0)) d.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function update(c, s) {
    if (!root) return;
    lastC = c; lastS = s;
    var tab = s.mapTab, item = findItem(tab, s.mapItem) ? s.mapItem : DEFAULT_ITEM[tab];
    var it = findItem(tab, item);
    root.setAttribute("data-tab", tab);
    root.setAttribute("data-item", item);
    TABS.forEach(function (t) {
      var b = root.querySelector("#bmTab-" + t.id);
      b.setAttribute("aria-selected", String(t.id === tab));
      b.tabIndex = t.id === tab ? 0 : -1;
      b.classList.toggle("is-active", t.id === tab);
    });
    var hsList = root.querySelectorAll(".hs");
    for (var i = 0; i < hsList.length; i++) {
      var g = hsList[i], on = g.getAttribute("data-tab") === tab;
      var hit = g.classList.contains("hs-pelvis") ? PELVIC[tab] && PELVIC[tab].indexOf(item) >= 0 : g.getAttribute("data-item") === item;
      g.classList.toggle("is-active", on && hit);
      g.setAttribute("tabindex", on ? "0" : "-1");
      g.setAttribute("aria-hidden", on ? "false" : "true");
      g.setAttribute("aria-pressed", String(on && g.getAttribute("data-item") === item));
    }
    var focusKey = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute("data-year") : null;
    root.querySelector(".bm-chips").innerHTML = chipsHtml(tab, item);
    root.querySelector(".bm-detail").innerHTML = detailHtml(tab, it, c);
    if (focusKey) { var fb = root.querySelector('.bm-year[data-year="' + focusKey + '"]'); if (fb) fb.focus(); }
  }

  function init(o) {
    opts = o; root = o.root;
    if (!root) return;
    root.innerHTML = skeleton();
    root.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var tabBtn = t.closest(".bm-tab"), chip = t.closest(".bm-chip"), yr = t.closest(".bm-year"), g = t.closest(".hs");
      if (tabBtn) { var tb = tabBtn.getAttribute("data-tab"); select(tb, findItem(tb, lastS.mapItem) ? lastS.mapItem : DEFAULT_ITEM[tb], false); return; }
      if (chip) { select(lastS.mapTab, chip.getAttribute("data-item"), true); return; }
      if (yr) { opts.setState({ claimYear: Number(yr.getAttribute("data-year")) }); return; }
      if (g && g.getAttribute("data-tab") === lastS.mapTab) select(lastS.mapTab, g.getAttribute("data-item"), true);
    });
    root.addEventListener("keydown", function (e) {
      var g = e.target.closest && e.target.closest(".hs");
      if (g && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        select(lastS.mapTab, g.getAttribute("data-item"), true);
        var again = root.querySelector('.hs.is-active[data-item="' + g.getAttribute("data-item") + '"]');
        if (again) again.focus();
        return;
      }
      var tabBtn = e.target.closest && e.target.closest(".bm-tab");
      if (tabBtn && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { // WAI-ARIA tabs：左右鍵切換
        e.preventDefault();
        var idx = 0;
        TABS.forEach(function (t, i) { if (t.id === lastS.mapTab) idx = i; });
        var next = TABS[(idx + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
        select(next, DEFAULT_ITEM[next], false);
        root.querySelector("#bmTab-" + next).focus();
      }
    });
  }

  window.BodyMap = { init: init, update: update, isValid: isValid, ITEMS: ITEMS, DEFAULT_ITEM: DEFAULT_ITEM };
})();
