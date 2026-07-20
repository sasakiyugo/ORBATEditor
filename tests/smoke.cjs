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

  click('[data-view="operations"]');
  click('#newOperationBtn');
  change('#opName', 'IRON LANTERN作戦');
  change('#opActor', 'JF統合任務部隊');
  change('#opEnemy', '仮想敵軍');
  change('#opArea', '北部作戦地域');
  change('#opIntent', '敵主力の反応前に要域を確保し、後続戦力の進出基盤を形成する。');
  change('#opEndState', '要域が確保され、後続戦力が安全に展開可能である。');
  change('#opObjectives', '指定要域を確保する。');
  change('#opFailure', '戦力損耗が許容値を超過、または補給線を維持できない場合。');
  change('#opAvailableHours', '12');
  change('#opDistanceKm', '120');
  change('#opSpeedKmh', '40');
  change('#opUnitPicker', 'u-bde');
  click('#addOperationUnitBtn');
  const operationMap = d.querySelector('#operationMap');
  operationMap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 });
  if (!d.querySelector('#operationMapBase').getAttribute('href')?.startsWith('data:image/jpeg;base64,')) throw new Error('旧世界地図画像がJANUSへ組み込まれていない');
  click('#mapZoomInBtn');
  if (operationMap.style.width !== '150%') throw new Error('JANUS地図ズームが機能していない');
  click('#mapZoomResetBtn');
  change('#mapShapeType', 'objective');
  d.querySelector('#mapShapeName').value = 'OBJ ALPHA';
  operationMap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 500, clientY: 180 }));
  change('#mapShapeType', 'route');
  d.querySelector('#mapShapeName').value = 'ROUTE BLUE';
  operationMap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 180, clientY: 420 }));
  operationMap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 183, clientY: 420 }));
  click('#finishShapeBtn');
  if (d.querySelector('#opDistanceKm').value !== '100' || !d.querySelector('#operationShapes').textContent.includes('100km')) throw new Error(`地図グリッド距離換算が不正: ${d.querySelector('#opDistanceKm').value}km`);
  change('#mapShapeType', 'area');
  d.querySelector('#mapShapeName').value = 'AO NORTH';
  operationMap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 350, clientY: 100 }));
  operationMap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 650, clientY: 100 }));
  operationMap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 600, clientY: 320 }));
  click('#finishShapeBtn');
  click('#generateCoaBtn');
  if (d.querySelectorAll('.coa-card').length !== 3) throw new Error('JANUSのCOAが3案生成されていない');
  click('#validateOperationBtn');
  const janusErrors = [...d.querySelectorAll('#operationChecks .check-item.error')];
  if (janusErrors.length) throw new Error(`JANUS整合性検査に想定外エラー: ${janusErrors.map(x=>x.textContent).join(' / ')}`);
  if (d.querySelector('#operationStatus').textContent !== '検査済') throw new Error('JANUS作戦が検査済へ遷移しない');
  if (!d.querySelector('#operationChecks').textContent.includes('作戦図の最長経路を100kmとして算出')) throw new Error('作戦図距離がルールエンジンへ渡っていない');
  const orderText = d.querySelector('#operationOrder').textContent;
  for (const heading of ['1. 情勢','2. 任務','3. 実行','4. 兵站','5. 指揮・通信']) if (!orderText.includes(heading)) throw new Error(`五段落命令に${heading}がない`);
  if (!orderText.includes('M1A2') || !orderText.includes('75')) throw new Error('五段落命令がORBAT集計を参照していない');
  const submittedId = d.querySelector('#operationList button.active').dataset.operationId;
  click('#submitOperationBtn');
  if (d.querySelector('#operationStatus').textContent !== '提出済' || !d.querySelector('#opName').disabled) throw new Error('JANUS提出ロックが機能していない');
  if (!d.querySelector('#operationOrder').textContent.includes('情報スナップショット：')) throw new Error('提出時スナップショットが確定していない');
  click('[data-view="editor"]');
  click('[data-action="select"][data-id="u-tk1"]');
  change(`.assignment-qty[data-id="${sampleTankOption.value}"]`, '20');
  click('[data-view="operations"]');
  click(`[data-operation-id="${submittedId}"]`);
  const frozenOrder = d.querySelector('#operationOrder').textContent;
  if (!frozenOrder.includes('75') || frozenOrder.includes('64')) throw new Error('提出済み計画書が後日のORBAT変更から固定されていない');
  click('#duplicateOperationBtn');
  const copyId = d.querySelector('#operationList button.active').dataset.operationId;
  if (copyId === submittedId || d.querySelector('#operationStatus').textContent !== '下書き') throw new Error('提出計画の複製再開が機能していない');
  change('#judgePlanA', submittedId);
  change('#judgePlanB', copyId);
  click('#comparePlansBtn');
  if (d.querySelectorAll('#judgeComparison .judge-plan').length !== 2 || !d.querySelector('#judgeComparison').textContent.includes('最終裁定は審判が行う')) throw new Error('審判比較が機能していない');
  if (errors.length) throw new Error(`画面エラー: ${errors.join(" / ")}`);

  console.log(JSON.stringify({ catalogItems: 1652, importedWeaponRows: 1651, broadCategoryDefinitions: 16, activeCategories: 15, uncategorizedItems: categoryCounts["その他"]||0, artilleryItems: categoryCounts["火砲・ロケット砲"], surfaceCombatantItems: categoryCounts["水上戦闘艦艇"], fixedWingItems: categoryCounts["固定翼航空機"], removedGenericItems: ["主力戦車","小銃"], sampleTank: "M1A2", priceDataMatches: 0, categoryFilterRadarItems: 32, initialPersonnel: initial.trim(), initialTankTotal: 88, updatedTankTotal: 75, friendlyFrameActualAspect: actualAspect, hostileFrameBounds: "1:1", appDarkOnly: true, chartBackground: "white", connectorGap, chartNodes: nodeCount, janusMapEmbedded: true, janusMapGridKm: 100, janusMappedRouteKm: 100, janusMapZoom: true, janusCoas: 3, janusChecksPassed: true, janusFiveParagraphOrder: true, janusSnapshotLocked: true, janusFrozenAfterOrbatChange: true, janusJudgePlans: 2, pageErrors: errors.length }));
  dom.window.close();
})().catch(error => { console.error(error); process.exit(1); });
