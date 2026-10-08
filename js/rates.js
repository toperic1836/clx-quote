/* =====================================================================
 * rates.js ── 富邦人壽真馨相守防癌定期健康保險（CLX）所有費率與規則
 * 南方通訊處版 115/10/08。每個數字的出處都標在旁邊；本檔不含任何自行假設的費率。
 * 來源文件（使用者提供）：
 *   [費率表] CLX 年繳保險費費率表（單位：元／每萬元保額，女性；附半年／季／月繳係數）
 *   [投保規則] CLX 投保規則 115/02/10
 *   [保費規定] CLX 保費規定 1141223
 *   [商品說明] CLX 商品內容說明 115/01/23（備查文號 115.02.10 富壽商精字第1140005477號）
 *   [條款] CLX 條款 CLX1150210（附表一 特定癌症、附表二 特定手術、附表三 失能程度）
 *   [保全規則] CLX 保全規則 115/02/10
 *   [建議書] CLX 官方建議書試算 xlsx V1.2-1150824（OP、P_DATA 工作表）
 * 已核對：建議書 P_DATA 的 76 筆費率（CLX10／CLX20 × 年齡）與費率表 PDF 完全一致；
 *         身故保障（DIE）＝費率 × 1.06 × min(保單年度, 繳費年期)、滿期（EXP）＝費率 × 1.06 × 繳費年期，逐筆比對 0 差異。
 * ===================================================================== */
(function () {
  "use strict";

  /* 年繳費率（元／每萬元保額）；鍵＝投保時保險年齡。[費率表] 10 年期 18～60、20 年期 18～50 */
  var RATES = {
    "10": {
      18: 435, 19: 440, 20: 445, 21: 450, 22: 455, 23: 460, 24: 465, 25: 470, 26: 480, 27: 490,
      28: 500, 29: 510, 30: 515, 31: 525, 32: 535, 33: 545, 34: 555, 35: 565, 36: 575, 37: 580,
      38: 590, 39: 600, 40: 610, 41: 620, 42: 630, 43: 640, 44: 650, 45: 660, 46: 670, 47: 680,
      48: 690, 49: 700, 50: 710, 51: 720, 52: 730, 53: 740, 54: 755, 55: 765, 56: 780, 57: 795,
      58: 825, 59: 845, 60: 880
    },
    "20": {
      18: 230, 19: 235, 20: 240, 21: 245, 22: 250, 23: 255, 24: 260, 25: 265, 26: 270, 27: 275,
      28: 280, 29: 285, 30: 290, 31: 295, 32: 300, 33: 310, 34: 315, 35: 325, 36: 330, 37: 335,
      38: 345, 39: 350, 40: 355, 41: 365, 42: 370, 43: 380, 44: 390, 45: 400, 46: 410, 47: 420,
      48: 435, 49: 450, 50: 470
    }
  };

  /* 繳別係數：[費率表] 註「半年繳費率=年繳費率×0.52、季繳×0.262、月繳×0.088」；
   * [建議書] OP!H4:K7 同值（換算格式 1＝傳統）。perYear＝每年期數。 */
  var PAY_MODES = {
    annual:     { label: "年繳",   suffix: "每年",   factor: 1,     perYear: 1 },
    semiannual: { label: "半年繳", suffix: "每半年", factor: 0.52,  perYear: 2 },
    quarterly:  { label: "季繳",   suffix: "每季",   factor: 0.262, perYear: 4 },
    monthly:    { label: "月繳",   suffix: "每月",   factor: 0.088, perYear: 12 }
  };

  /* 繳費方式與折扣：[保費規定] 首期匯款 1%；金融機構轉帳、富邦信用卡、自行繳費 1%；一般信用卡無；
   * 主約折扣上限 1%。[建議書] OP!H31:I37 同（匯款／金融機構轉帳／富邦信用卡／自行繳費 1%，一般信用卡 0%）。
   * 首期：[保費規定] 金融機構轉帳、一般信用卡、匯款；富邦信用卡依 [建議書] OP!L31:L35 也列為首期選項。
   * 續期：[保費規定] 金融機構轉帳、一般信用卡、自行繳費；富邦信用卡依 [建議書] OP!M31:M35。 */
  var PAY_METHODS = {
    first: {
      transfer:  { label: "金融機構轉帳", disc: 0.01 },
      fubonCard: { label: "富邦信用卡",   disc: 0.01 },
      card:      { label: "一般信用卡",   disc: 0 },
      remit:     { label: "匯款",         disc: 0.01 }
    },
    renew: {
      transfer:  { label: "金融機構轉帳", disc: 0.01 },
      fubonCard: { label: "富邦信用卡",   disc: 0.01 },
      card:      { label: "一般信用卡",   disc: 0 },
      self:      { label: "自行繳費",     disc: 0.01 }
    }
  };

  var RULES = {
    code: "CLX",
    name: "富邦人壽真馨相守防癌定期健康保險",
    shortName: "真馨相守防癌定期健康保險",
    female: true,                            // [投保規則] 女性專屬商品，被保險人限女性投保
    insuranceAge: { roundUpAfterMonths: 6 }, // [商品說明] 保險年齡：未滿一歲之零數超過六個月者加算一歲
    terms: ["10", "20"],                     // [投保規則] 繳費年期
    // [投保規則] 10 年期 18 足歲～60 歲、20 年期 18 足歲～50 歲；
    // [建議書] OP!C15:D16：最低以「足歲」檢核、最高以「保險年齡」檢核
    ages: { "10": [18, 60], "20": [18, 50] },
    coverToAge: 89,                          // [投保規則]／[條款] 保險年齡屆滿八十九歲
    min: 50, max: 300,                       // [投保規則] 最低 50 萬、累計本險種最高 300 萬（以萬元為單位）
    cancerTotalMax: 500,                     // [投保規則] CLX＋其他保額型癌症險累計最高 500 萬
    maxDiscount: 0.01,                       // [保費規定] 主約保費之折扣上限 1%
    healthDiscount: 0.01,                    // [保費規定]／[商品說明] 健康管理保險費折扣 1%（次一保單年度續期）
    returnRatio: 1.06,                       // [商品說明] 當年度保險金額＝年繳保險費總和 × 1.06 − 已申領保險金
    earlyPct: 0.10,                          // [商品說明] 初期／輕度：第2保單年度起 保險金額 10%
    severePct: 1.00,                         // [商品說明] 重度：第2保單年度起 保險金額 100%
    specificPct: { 2: 0.10, 3: 0.20, 4: 0.30, 5: 0.40, 6: 0.50 }, // [商品說明] 特定癌症（重度）第2～5年度、第6年度起
    surgeryPct: 0.02,                        // [商品說明] 特定手術 保險金額 2%
    illnessPct: 0.10,                        // [商品說明] 特定傷病 第2保單年度起 保險金額 10%
    waitingDays: 90,                         // [商品說明] 等待期間 90 日
    diseaseDays: 30                          // [商品說明] 「疾病」：生效日起持續有效 30 日以後
  };

  /* [條款] 附表一：特定癌症（重度）表（ICD-10-CM） */
  var SPECIFIC_CANCERS = [
    ["C43", "皮膚惡性黑色素瘤"], ["C44", "皮膚之其他及未明示惡性腫瘤"], ["C50", "乳房惡性腫瘤"],
    ["C51", "外陰惡性腫瘤"], ["C52", "陰道惡性腫瘤"], ["C53", "子宮頸惡性腫瘤"], ["C54", "子宮體惡性腫瘤"],
    ["C55", "未明示部位子宮惡性腫瘤"], ["C56", "卵巢惡性腫瘤"], ["C57", "其他及未明示女性生殖器官之惡性腫瘤"],
    ["C58", "胎盤惡性腫瘤"]
  ];
  /* [條款] 附表二：特定手術表（14 項） */
  var SPECIFIC_SURGERIES = [
    "腹式或陰道式會陰尿道懸吊術", "腹式尿失禁手術", "陰道式尿失禁手術（含Kelly plication）", "陰道懸吊術",
    "膀胱懸吊術", "KELLY手術", "尿道人工擴約肌植入術", "（後）腹腔鏡膀胱頸懸吊術", "從腹腔進入陰道固定術",
    "從陰道進入之陰道固定術", "腹腔鏡陰道懸吊術", "經腹腔之骨盆底重建術", "陰道人工網膜外露修復術", "子宮懸吊術"
  ];
  /* [條款] 附表二 英文名稱（與上表同順序） */
  var SPECIFIC_SURGERIES_EN = [
    "Abdominal perineal urethral suspension (APUS) or Vaginal perineal urethral suspension (VPUS)",
    "Transabdominal urinary incontinence surgery", "Transvaginal urinary incontinence surgery (Kelly plication included)",
    "Vaginal suspension", "Suspension of urinary bladder", "KELLY operation", "Artificial urinary sphincter implantation",
    "(Retroperitoneoscopy) Laparoscopic bladder neck suspension", "Transabdominal colpopexy", "Colpopexy, vaginal approach",
    "Laparoscopic colpopexy", "Transabdominal pelvic floor reconstruction", "Vaginal mesh extrusion repair", "Uterine suspension"
  ];
  /* [商品說明]／[條款] 第二條 特定傷病（二項）及定義（節錄原文） */
  var SPECIFIC_ILLNESSES = ["嚴重全身性紅斑性狼瘡腎病變", "嚴重類風濕性關節炎"];
  var ILLNESS_DEFS = {
    lupus: "係指一種體內出現對抗多種自體抗原的自體抗體之自體免疫性疾病合併腎病變，且經腎臟病理切片之檢查證實符合世界衛生組織 WHO 所定義的狼瘡性腎炎第三級至第六級的病理分類，合併蛋白尿。經醫院腎臟、風濕或免疫專科醫師確診者。其他類型之紅斑性狼瘡，如盤性狼瘡，或只有血液及關節病變者除外。",
    ra: "係指經醫院風濕或免疫專科醫師診斷確定因類風濕性關節炎而導致同時符合下列兩項條件者：1.被保險人三個（含）以上之重要關節出現關節炎與關節的破壞及外觀嚴重變形，導致關節失去機能。所謂重要關節係指左右手、左右腕、左右肘、頸椎、左右膝、左右踝及左右蹠趾關節，以上關節區分左右部位，均各自視為一個重要關節。2.依巴氏量表(Barthel Index)或依其它臨床專業評量表診斷判定其造成進食、移位、如廁、沐浴、平地行動及更衣等六項目常生活自理能力存有三項（含）以上之障礙。"
  };
  /* [條款] 第二條 癌症（初期）、癌症（輕度）中與 CLX 圖示部位相關的項目（原文）；癌症（重度）＝初期和輕度以外之癌症 */
  var EARLY_MILD = {
    all:    [["初期", "原位癌或零期癌"]],
    breast: [["輕度", "第一期乳癌"]],
    cervix: [["輕度", "第一期子宮頸癌"]],
    ovary:  [["輕度", "邊緣性卵巢癌"]],
    skin:   [["初期", "第二期（含）以下且非惡性黑色素瘤之皮膚癌（包括皮膚附屬器癌及皮纖維肉瘤）"], ["輕度", "第一期黑色素瘤"]]
  };

  /* 預設示範資料（畫面上可改）：民國 75/01/01 生、10 年期、100 萬、年繳、金融機構轉帳；罹癌情境第 6 保單年度 */
  var DEFAULTS = {
    name: "",
    rocBirth: "750101",
    payMode: "annual",
    term: "10",
    amount: 100,
    firstMethod: "transfer",
    renewMethod: "transfer",
    healthCheck: false,
    claimYear: 6,       // 罹癌情境：診斷確定的保單年度（第6年度起特定癌症給付達 50%）
    mapTab: "cancer",   // 圖像點選：cancer 特定癌症／surgery 特定手術／illness 特定傷病（隨客戶頁連結帶出）
    mapItem: "breast"   // 圖像點選：目前選取的部位
  };

  window.QUOTE_RATES = {
    RATES: RATES, PAY_MODES: PAY_MODES, PAY_METHODS: PAY_METHODS, RULES: RULES,
    SPECIFIC_CANCERS: SPECIFIC_CANCERS, SPECIFIC_SURGERIES: SPECIFIC_SURGERIES, SPECIFIC_SURGERIES_EN: SPECIFIC_SURGERIES_EN,
    SPECIFIC_ILLNESSES: SPECIFIC_ILLNESSES, ILLNESS_DEFS: ILLNESS_DEFS, EARLY_MILD: EARLY_MILD,
    DEFAULTS: DEFAULTS
  };
})();
