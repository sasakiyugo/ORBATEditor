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

  const initial = d.querySelector("#aggregatePersonnel").textContent;
  if (!initial.includes("1,700")) throw new Error(`初期集計が不正: ${initial}`);
  const detail = d.querySelector("#aggregateEquipment").textContent;
  if (!detail.includes("主力戦車") || !detail.includes("88") || !detail.includes("HIFV-40") || !detail.includes("40")) {
    throw new Error(`初期装備集計が不正: ${detail}`);
  }

  click('[data-action="select"][data-id="u-tk1"]');
  change('.assignment-qty[data-id="eq-mbt"]', "31");
  click('[data-action="select"][data-id="u-bde"]');
  const updated = d.querySelector("#aggregateEquipment").textContent;
  if (!updated.includes("75")) throw new Error(`即時再集計が不正: ${updated}`);
  if (!d.querySelector("#directSection").hidden) throw new Error("旅団に直接割当UIが表示されている");

  click('[data-view="chart"]');
  const nodeCount = d.querySelectorAll("#orgSvg .org-node").length;
  if (nodeCount < 4) throw new Error(`組織図ノード不足: ${nodeCount}`);
  if (errors.length) throw new Error(`画面エラー: ${errors.join(" / ")}`);

  console.log(JSON.stringify({ initialPersonnel: initial.trim(), initialTankTotal: 88, updatedTankTotal: 75, chartNodes: nodeCount, pageErrors: errors.length }));
  dom.window.close();
})().catch(error => { console.error(error); process.exit(1); });
