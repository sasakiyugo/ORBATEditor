const { JSDOM } = require("jsdom");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const errors = [];
  const dom = await JSDOM.fromFile(path.resolve(__dirname, "..", "index.html"), {
    runScripts: "dangerously",
    resources: "usable",
    url: pathToFileURL(path.resolve(__dirname, "..", "index.html")).href,
    beforeParse(window) {
      window.confirm = () => true;
      window.alert = message => errors.push(String(message));
      window.URL.createObjectURL = () => "blob:test";
      window.URL.revokeObjectURL = () => {};
    }
  });
  await new Promise((resolve, reject) => {
    dom.window.addEventListener("load", resolve, { once: true });
    setTimeout(() => reject(new Error("画面ロードがタイムアウトしました")), 3000);
  });
  const d = dom.window.document;
  const click = selector => d.querySelector(selector).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  const change = (selector, value) => {
    const element = d.querySelector(selector);
    element.value = value;
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  };
  const input = (selector, value) => {
    const element = d.querySelector(selector);
    element.value = value;
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };

  const initial = d.querySelector("#aggregatePersonnel").textContent;
  if (!initial.includes("1,700")) throw new Error(`初期集計が不正: ${initial}`);
  const detail = d.querySelector("#aggregateEquipment").textContent;
  if (!detail.includes("M1A2") || !detail.includes("88") || !detail.includes("HIFV-40") || !detail.includes("40")) {
    throw new Error(`初期装備集計が不正: ${detail}`);
  }
  const friendlySymbol = d.querySelector("#symbolPreview svg");
  const friendlyFrame = friendlySymbol.querySelector("rect.node-frame");
  const actualAspect = Number(friendlyFrame.getAttribute("width")) / Number(friendlyFrame.getAttribute("height"));
  if (Math.abs(actualAspect - 1.5) > 0.001) throw new Error(`APP-6D味方フレーム実寸が3:2ではない: ${actualAspect}`);
  if (d.documentElement.dataset.theme !== "dark") throw new Error("常時ダークモードになっていない");
  if (d.querySelector("#themeBtn")) throw new Error("廃止したライトモード切替が残っている");
  if (!d.querySelector("#catalogCount").textContent.includes("全1,652件")) throw new Error(`兵器カタログ件数が不正: ${d.querySelector("#catalogCount").textContent}`);
  input("#catalogSearch", "AN/TPS-77");
  const radarResult = d.querySelector("#catalogTable").textContent;
  if (!radarResult.includes("可搬式／自走式レーダー") || !radarResult.includes("生産国: アメリカ")) throw new Error(`兵器データが不足: ${radarResult}`);
  input("#catalogSearch", "億円");
  if (!d.querySelector("#catalogCount").textContent.includes("該当0件")) throw new Error("価格データがカタログへ混入している");
  input("#catalogSearch", "主力戦車");
  if ([...d.querySelectorAll("#catalogTable strong")].some(x=>x.textContent==="主力戦車")) throw new Error("汎用ノイズ品目『主力戦車』が残っている");
  input("#catalogSearch", "小銃");
  if ([...d.querySelectorAll("#catalogTable strong")].some(x=>x.textContent==="小銃")) throw new Error("汎用ノイズ品目『小銃』が残っている");
  input("#catalogSearch", "");
  const categoryCounts=Object.fromEntries([...d.querySelectorAll("#equipmentCategoryFilter option")].slice(1).map(x=>[x.value,Number(x.textContent.match(/（([\d,]+)）/)?.[1].replaceAll(",","")||0)]));
  if (categoryCounts["その他"]) throw new Error(`「その他」に${categoryCounts["その他"]}件残っている`);
  if (categoryCounts["火砲・ロケット砲"]!==187) throw new Error(`自走砲の統合が不正: ${categoryCounts["火砲・ロケット砲"]}件`);
  if (categoryCounts["水上戦闘艦艇"]!==173) throw new Error(`フリゲート・コルベットの統合が不正: ${categoryCounts["水上戦闘艦艇"]}件`);
  if (categoryCounts["固定翼航空機"]!==290) throw new Error(`電子戦／SEAD機の統合が不正: ${categoryCounts["固定翼航空機"]}件`);
  input("#catalogSearch", "");
  change("#unitAffiliation", "hostile");
  const hostileSymbol = d.querySelector("#symbolPreview svg");
  if (hostileSymbol.dataset.frameAspect !== "1" || !hostileSymbol.querySelector("polygon.node-frame")) throw new Error("APP-6D敵フレームが正方形境界の菱形ではない");
  change("#unitAffiliation", "friendly");

  click('[data-action="select"][data-id="u-tk1"]');
  if (d.querySelector("#equipmentCategoryFilter").options.length > 17) throw new Error("兵器区分が大分類へ整理されていない");
  change("#equipmentCategoryFilter", "レーダー・センサー");
  const filteredOptions = [...d.querySelectorAll("#equipmentPicker option")];
  if (filteredOptions.length !== 32 || filteredOptions.some(x => x.dataset.category !== "レーダー・センサー")) throw new Error(`兵器区分フィルターが不正: ${filteredOptions.length}件`);
  if (!d.querySelector("#equipmentPicker").textContent.includes("AN/TPS-77")) throw new Error("区分フィルター後に対象兵器が表示されない");
  change("#equipmentCategoryFilter", "");
  const sampleTankOption=[...d.querySelectorAll("#equipmentPicker option")].find(x=>x.textContent.startsWith("M1A2 —"));
  if (!sampleTankOption) throw new Error("サンプル戦車M1A2が見つからない");
  change(`.assignment-qty[data-id="${sampleTankOption.value}"]`, "31");
  click('[data-action="select"][data-id="u-bde"]');
  const updated = d.querySelector("#aggregateEquipment").textContent;
  if (!updated.includes("75")) throw new Error(`即時再集計が不正: ${updated}`);
  if (!d.querySelector("#directSection").hidden) throw new Error("旅団に直接割当UIが表示されている");

  click('[data-view="chart"]');
  const nodeCount = d.querySelectorAll("#orgSvg .org-node").length;
  if (nodeCount < 4) throw new Error(`組織図ノード不足: ${nodeCount}`);
  const connector = d.querySelector('#orgSvg path[data-from][data-to]');
  const connectorGap = Number(connector.dataset.nodeY) - Number(connector.dataset.endY);
  if (connectorGap < 14) throw new Error(`接続線と子ノードの間隔不足: ${connectorGap}`);
  if (d.querySelector('#orgSvg > rect').getAttribute('fill') !== '#ffffff') throw new Error("組織図背景が白ではない");
  if (errors.length) throw new Error(`画面エラー: ${errors.join(" / ")}`);

  console.log(JSON.stringify({ catalogItems: 1652, importedWeaponRows: 1651, broadCategoryDefinitions: 16, activeCategories: 15, uncategorizedItems: categoryCounts["その他"]||0, artilleryItems: categoryCounts["火砲・ロケット砲"], surfaceCombatantItems: categoryCounts["水上戦闘艦艇"], fixedWingItems: categoryCounts["固定翼航空機"], removedGenericItems: ["主力戦車","小銃"], sampleTank: "M1A2", priceDataMatches: 0, categoryFilterRadarItems: 32, initialPersonnel: initial.trim(), initialTankTotal: 88, updatedTankTotal: 75, friendlyFrameActualAspect: actualAspect, hostileFrameBounds: "1:1", appDarkOnly: true, chartBackground: "white", connectorGap, chartNodes: nodeCount, pageErrors: errors.length }));
  dom.window.close();
})().catch(error => { console.error(error); process.exit(1); });
