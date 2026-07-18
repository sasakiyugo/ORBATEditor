"use strict";

const $ = (id) => document.getElementById(id);
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const esc = (value="") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const int = (value) => Math.max(0, Math.floor(Number(value) || 0));

const DEFAULT_ECHELONS = [
  ["team","組（チーム）","Ø",1,false],["squad","分隊","●",2,false],["section","班（セクション）","●●",3,false],
  ["platoon","小隊","●●●",4,false],["company","中隊","|",5,false],["battalion","大隊","||",6,false],
  ["regiment","連隊","|||",7,false],["brigade","旅団","X",8,true],["division","師団","XX",9,true],
  ["corps","軍団","XXX",10,true],["army","軍","XXXX",11,true],["army-group","軍集団","XXXXX",12,true]
].map(([id,name,symbol,rank,brigadeOrAbove])=>({id,name,symbol,rank,brigadeOrAbove}));

const DEFAULT_TYPES = [
  ["infantry","歩兵"],["mech-inf","機械化歩兵"],["armor","機甲（戦車）"],["recon","偵察"],["artillery","砲兵"],
  ["sp-artillery","自走砲兵"],["mortar","迫撃砲"],["air-defense","防空"],["anti-tank","対戦車"],["engineer","工兵"],
  ["signal","通信"],["logistics","補給／兵站"],["medical","衛生"],["aviation","航空"],["hq","司令部"]
].map(([id,name])=>({id,name}));

const BASE_CATALOG = [
  {id:"eq-mbt",name:"主力戦車",category:"戦車",specs:"",notes:""},
  {id:"eq-hifv40",name:"HIFV-40",category:"装甲車両",specs:"",notes:""},
  {id:"eq-rifle",name:"小銃",category:"小火器",specs:"",notes:""}
];
const IMPORTED_CATALOG = (window.ORBAT_CATALOG_DATA||[]).map(([name,category,country],i)=>({
  id:`catalog-${String(i+1).padStart(4,"0")}`,name,category:category||"その他",
  specs:country?`生産国: ${country}`:"",notes:"兵器価格一覧(1).csvから価格を除外して収録"
}));
const CATALOG_SEED = [...BASE_CATALOG,...IMPORTED_CATALOG];
const DEFAULT_CATEGORIES = [...new Set(["小火器","迫撃砲","火砲","戦車","装甲車両","対空","誘導弾","車両","航空機","その他",...IMPORTED_CATALOG.map(x=>x.category)])];
const catalogKey = x => `${x.name}\u0000${x.category}\u0000${x.specs||""}`;
function mergeBuiltInCatalog(project){const keys=new Set(project.catalog.map(catalogKey)),ids=new Set(project.catalog.map(x=>x.id));let added=0;for(const item of CATALOG_SEED){if(keys.has(catalogKey(item)))continue;const copy=clone(item);if(ids.has(copy.id))copy.id=uid("catalog");project.catalog.push(copy);keys.add(catalogKey(copy));ids.add(copy.id);added++}project.categories=[...new Set([...(project.categories||[]),...DEFAULT_CATEGORIES])];return added}

const sampleProject = () => ({
  meta:{name:"サンプル編成",version:1,updatedAt:new Date().toISOString()},
  echelons:clone(DEFAULT_ECHELONS), unitTypes:clone(DEFAULT_TYPES),
  categories:clone(DEFAULT_CATEGORIES),
  catalog:clone(CATALOG_SEED),
  units:[
    {id:"u-div",name:"第1機甲師団",abbr:"1AD",parentId:null,echelonId:"division",unitTypeId:"armor",affiliation:"friendly",sortOrder:1,personnel:null,equipment:[],notes:""},
    {id:"u-bde",name:"第1機甲旅団",abbr:"1AB",parentId:"u-div",echelonId:"brigade",unitTypeId:"armor",affiliation:"friendly",sortOrder:1,personnel:null,equipment:[],notes:""},
    {id:"u-tk1",name:"第1戦車大隊",abbr:"1Tk",parentId:"u-bde",echelonId:"battalion",unitTypeId:"armor",affiliation:"friendly",sortOrder:1,personnel:500,equipment:[{catalogId:"eq-mbt",quantity:44}],notes:""},
    {id:"u-tk2",name:"第2戦車大隊",abbr:"2Tk",parentId:"u-bde",echelonId:"battalion",unitTypeId:"armor",affiliation:"friendly",sortOrder:2,personnel:500,equipment:[{catalogId:"eq-mbt",quantity:44}],notes:""},
    {id:"u-mech",name:"第1機械化歩兵大隊",abbr:"1Mech",parentId:"u-bde",echelonId:"battalion",unitTypeId:"mech-inf",affiliation:"friendly",sortOrder:3,personnel:700,equipment:[{catalogId:"eq-hifv40",quantity:40}],notes:""}
  ]
});

let state = sampleProject();
let selectedId = "u-bde";
let collapsed = new Set();
let history = [], future = [], dirty = false;
let chartZoom = 1, chartPan = {x:40,y:40}, panStart = null;

function echelon(id){ return state.echelons.find(x=>x.id===id) || state.echelons[0]; }
function unitType(id){ return state.unitTypes.find(x=>x.id===id) || {id:"",name:"未設定"}; }
function catalogItem(id){ return state.catalog.find(x=>x.id===id); }
function unit(id){ return state.units.find(x=>x.id===id); }
function children(id){ return state.units.filter(x=>x.parentId===id).sort((a,b)=>a.sortOrder-b.sortOrder || a.name.localeCompare(b.name,"ja")); }
function isAggregateOnly(u){ return !!echelon(u.echelonId).brigadeOrAbove; }
function descendants(id){ const out=[]; const walk=x=>children(x).forEach(c=>{out.push(c);walk(c.id)}); walk(id); return out; }
function aggregate(id, seen=new Set()){
  if(seen.has(id)) return {personnel:0,equipment:{}};
  seen.add(id); const u=unit(id); if(!u) return {personnel:0,equipment:{}};
  const result={personnel:isAggregateOnly(u)?0:int(u.personnel),equipment:{}};
  if(!isAggregateOnly(u)) (u.equipment||[]).forEach(a=>result.equipment[a.catalogId]=(result.equipment[a.catalogId]||0)+int(a.quantity));
  children(id).forEach(c=>{const sub=aggregate(c.id,seen);result.personnel+=sub.personnel;Object.entries(sub.equipment).forEach(([k,v])=>result.equipment[k]=(result.equipment[k]||0)+v)});
  return result;
}
function validateProject(data){
  if(!data || typeof data!=="object" || !Array.isArray(data.units)||!Array.isArray(data.catalog)||!Array.isArray(data.echelons)||!Array.isArray(data.unitTypes)) throw new Error("ORBATプロジェクトとして必要な配列がありません。");
  const ids=new Set(); for(const u of data.units){if(!u.id||ids.has(u.id)) throw new Error("部隊IDが不正または重複しています。");ids.add(u.id)}
  for(const u of data.units){let cur=u,seen=new Set([u.id]);while(cur.parentId){if(seen.has(cur.parentId))throw new Error(`循環参照を検出: ${u.name}`);seen.add(cur.parentId);cur=data.units.find(x=>x.id===cur.parentId);if(!cur)break}}
  return true;
}
function checkpoint(){ history.push(JSON.stringify(state)); if(history.length>60)history.shift(); future=[]; dirty=true; state.meta.updatedAt=new Date().toISOString(); updateHeader(); }
function mutate(fn){ checkpoint(); fn(); renderAll(); }
function undo(){if(!history.length)return;future.push(JSON.stringify(state));state=JSON.parse(history.pop());selectedId=unit(selectedId)?selectedId:state.units[0]?.id;dirty=true;renderAll()}
function redo(){if(!future.length)return;history.push(JSON.stringify(state));state=JSON.parse(future.pop());selectedId=unit(selectedId)?selectedId:state.units[0]?.id;dirty=true;renderAll()}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2200)}
function download(name,blob){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function isDark(){return true}

function renderAll(){ updateHeader(); renderTree(); renderDetail(); renderCatalog(); renderSettings(); populateChartRoots(); if($("chartView").classList.contains("active")) renderChart(); }
function updateHeader(){ $("projectName").textContent=state.meta.name+(dirty?" • 未保存":"");$("undoBtn").disabled=!history.length;$("redoBtn").disabled=!future.length; }
function switchView(name){document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".view-btn").forEach(x=>x.classList.toggle("active",x.dataset.view===name));$(`${name}View`).classList.add("active");if(name==="chart")renderChart()}

function renderTree(){
  const q=$("treeSearch").value.trim().toLowerCase(); const roots=children(null);
  const matches=u=>!q || u.name.toLowerCase().includes(q)||(u.abbr||"").toLowerCase().includes(q)||descendants(u.id).some(matches);
  const row=(u,depth)=>{if(!matches(u))return"";const kids=children(u.id),open=q||!collapsed.has(u.id);return `<div class="tree-row ${u.id===selectedId?"selected":""}" style="padding-left:${depth*15}px" role="treeitem"><button class="tree-toggle" data-action="toggle" data-id="${u.id}" ${kids.length?"":"disabled"}>${kids.length?(open?"▾":"▸"):"·"}</button><span class="tree-symbol">${unitSymbolSvg(u,{width:30,height:22,labels:false,dark:isDark()})}</span><span class="tree-label" data-action="select" data-id="${u.id}">${esc(u.name)}<small>${esc(echelon(u.echelonId).name)} · ${esc(unitType(u.unitTypeId).name)}</small></span><span class="tree-actions"><button data-action="up" data-id="${u.id}" title="上へ">↑</button><button data-action="down" data-id="${u.id}" title="下へ">↓</button><button data-action="add" data-id="${u.id}" title="子部隊追加">＋</button></span></div>${open?kids.map(c=>row(c,depth+1)).join(""):""}`};
  $("unitTree").innerHTML=roots.length?roots.map(r=>row(r,0)).join(""):`<div class="empty-state"><p>部隊がありません。</p></div>`;
}
function selectOptions(items,value,label=x=>x.name){return items.map(x=>`<option value="${esc(x.id)}" ${x.id===value?"selected":""}>${esc(label(x))}</option>`).join("")}
function renderDetail(){
  const u=unit(selectedId); $("emptyDetail").hidden=!!u;$("detailContent").hidden=!u;
  if(!u){$("symbolPreview").innerHTML="<p>部隊を選択すると記号を表示します。</p>";return}
  $("detailTitle").textContent=u.name;$("unitName").value=u.name;$("unitAbbr").value=u.abbr||"";$("unitNotes").value=u.notes||"";
  $("unitEchelon").innerHTML=selectOptions([...state.echelons].sort((a,b)=>a.rank-b.rank),u.echelonId,x=>`${x.symbol} ${x.name}`);
  $("unitType").innerHTML=selectOptions(state.unitTypes,u.unitTypeId);$("unitAffiliation").value=u.affiliation;
  const forbidden=new Set(descendants(u.id).map(x=>x.id));forbidden.add(u.id);
  $("unitParent").innerHTML=`<option value="">（ルート）</option>`+selectOptions(state.units.filter(x=>!forbidden.has(x.id)),u.parentId||"",x=>`${x.name}［${echelon(x.echelonId).name}］`);
  const direct=!isAggregateOnly(u);$("directSection").hidden=!direct;
  $("unitPersonnel").value=direct?int(u.personnel):"";
  $("equipmentPicker").innerHTML=state.catalog.length?selectOptions([...state.catalog].sort((a,b)=>a.name.localeCompare(b.name,"ja")),""):`<option value="">カタログが空です</option>`;
  renderEquipmentTables(u); const agg=aggregate(u.id);$("aggregatePersonnel").textContent=`人員 ${agg.personnel.toLocaleString()}名`;
  $("aggregateTitle").textContent=isAggregateOnly(u)?"配下全部隊の集計":"配下を含む総計";
  const categories={};Object.entries(agg.equipment).forEach(([id,qty])=>{const item=catalogItem(id);const c=item?.category||"不明";categories[c]=(categories[c]||0)+qty});
  $("categorySummary").innerHTML=Object.entries(categories).sort().map(([c,q])=>`<span class="stat"><strong>${esc(c)}</strong> ${q.toLocaleString()}</span>`).join("")||`<span class="stat">装備なし</span>`;
  $("symbolPreview").innerHTML=unitSymbolSvg(u,{width:250,height:180,labels:true,dark:isDark()});
  const warns=[];if(u.parentId){const p=unit(u.parentId);if(p&&echelon(u.echelonId).rank>=echelon(p.echelonId).rank)warns.push("子部隊の階梯が上級部隊と同格以上です。")}if(isAggregateOnly(u)&&((u.equipment||[]).length||u.personnel))warns.push("旅団以上の部隊に直接割当データがあります。JSON出力前に解消してください。");
  $("warningBox").hidden=!warns.length;$("warningBox").innerHTML=warns.map(esc).join("<br>");
}
function equipmentRows(entries,editable){
  const rows=Object.entries(entries).filter(([,q])=>q>0).sort((a,b)=>(catalogItem(a[0])?.category||"").localeCompare(catalogItem(b[0])?.category||"")||(catalogItem(a[0])?.name||"").localeCompare(catalogItem(b[0])?.name||""));
  if(!rows.length)return `<p class="muted">装備の割当はありません。</p>`;
  return `<table class="data-table"><thead><tr><th>区分</th><th>品目</th><th>数量</th>${editable?"<th></th>":""}</tr></thead><tbody>${rows.map(([id,qty])=>{const item=catalogItem(id)||{name:`不明 (${id})`,category:"不明"};return `<tr><td>${esc(item.category)}</td><td>${esc(item.name)}</td><td>${editable?`<input class="assignment-qty" data-id="${esc(id)}" type="number" min="0" value="${qty}">`:qty.toLocaleString()}</td>${editable?`<td><button class="danger assignment-delete" data-id="${esc(id)}">削除</button></td>`:""}</tr>`}).join("")}</tbody></table>`;
}
function renderEquipmentTables(u){const direct=Object.fromEntries((u.equipment||[]).map(a=>[a.catalogId,int(a.quantity)]));$("directEquipment").innerHTML=equipmentRows(direct,true);$("aggregateEquipment").innerHTML=equipmentRows(aggregate(u.id).equipment,false)}

function affiliationStyle(a){return {friendly:{stroke:"#225f87",fill:"#e9f5fb"},hostile:{stroke:"#a33b3b",fill:"#fff0f0"},neutral:{stroke:"#3c8a55",fill:"#eefaf1"},unknown:{stroke:"#8c6e21",fill:"#fff8e2"}}[a]||{stroke:"#333",fill:"#fff"}}
function glyph(type,x,y,w,h){
  const L=(x1,y1,x2,y2,extra="")=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`; const cx=x+w/2,cy=y+h/2;
  const oval=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.27}" ry="${h*.25}"/>`, cross=L(x+w*.2,y+h*.2,x+w*.8,y+h*.8)+L(x+w*.8,y+h*.2,x+w*.2,y+h*.8);
  switch(type){case"infantry":return cross;case"mech-inf":return cross+oval;case"armor":return oval;case"recon":return L(x+w*.2,y+h*.8,x+w*.8,y+h*.2);case"artillery":return `<circle cx="${cx}" cy="${cy}" r="${h*.16}" fill="currentColor"/>`;case"sp-artillery":return `<circle cx="${cx}" cy="${cy-h*.1}" r="${h*.11}" fill="currentColor"/>`+oval;case"mortar":return `<circle cx="${cx}" cy="${cy+h*.13}" r="${h*.1}" fill="currentColor"/>`+L(cx,cy+h*.05,cx,y+h*.18)+`<polyline points="${cx-h*.1},${y+h*.3} ${cx},${y+h*.16} ${cx+h*.1},${y+h*.3}"/>`;case"air-defense":return `<path d="M ${x+w*.2} ${y+h*.72} Q ${cx} ${y+h*.12} ${x+w*.8} ${y+h*.72}"/>`;case"anti-tank":return `<polyline points="${x+w*.25},${y+h*.7} ${cx},${y+h*.25} ${x+w*.75},${y+h*.7}"/>`;case"engineer":return `<path d="M${x+w*.28} ${y+h*.2}V${y+h*.8}M${x+w*.28} ${y+h*.2}H${x+w*.72}M${x+w*.28} ${cy}H${x+w*.62}M${x+w*.28} ${y+h*.8}H${x+w*.72}"/>`;case"signal":return `<polyline points="${x+w*.3},${y+h*.75} ${cx},${y+h*.2} ${cx},${y+h*.7} ${x+w*.7},${y+h*.25}"/>`;case"medical":return L(cx,y+h*.22,cx,y+h*.78,"stroke-width=5")+L(x+w*.3,cy,x+w*.7,cy,"stroke-width=5");case"aviation":return `<path d="M${x+w*.2} ${cy}L${cx} ${y+h*.25}L${x+w*.8} ${cy}L${cx} ${y+h*.42}V${y+h*.75}"/>`;case"hq":return `<text x="${cx}" y="${cy+h*.12}" text-anchor="middle" font-size="${h*.35}" font-weight="700">HQ</text>`;case"logistics":return `<path d="M${x+w*.25} ${y+h*.32}H${x+w*.68}L${x+w*.78} ${cy}V${y+h*.67}H${x+w*.25}Z"/>`+`<circle cx="${x+w*.38}" cy="${y+h*.72}" r="${h*.07}"/><circle cx="${x+w*.66}" cy="${y+h*.72}" r="${h*.07}"/>`;default:return `<text x="${cx}" y="${cy+h*.15}" text-anchor="middle" font-size="${h*.32}">?</text>`}
}
// APP-6D / MIL-STD-2525D land-unit frame proportions. The friendly frame is 3:2.
// Diamond, square and quatrefoil frames use square bounds and must never be stretched.
const APP6D_FRAME_ASPECT={friendly:1.5,hostile:1,neutral:1,unknown:1};
function frameShape(a,x,y,w,h){if(a==="hostile")return `<polygon class="node-frame" points="${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}"/>`;if(a==="neutral")return `<rect class="node-frame" x="${x}" y="${y}" width="${w}" height="${h}"/>`;if(a==="unknown")return `<path class="node-frame" d="M${x+w*.5} ${y}Q${x+w*.75} ${y} ${x+w*.75} ${y+h*.25}Q${x+w} ${y+h*.25} ${x+w} ${y+h*.5}Q${x+w} ${y+h*.75} ${x+w*.75} ${y+h*.75}Q${x+w*.75} ${y+h} ${x+w*.5} ${y+h}Q${x+w*.25} ${y+h} ${x+w*.25} ${y+h*.75}Q${x} ${y+h*.75} ${x} ${y+h*.5}Q${x} ${y+h*.25} ${x+w*.25} ${y+h*.25}Q${x+w*.25} ${y} ${x+w*.5} ${y}Z"/>`;return `<rect class="node-frame" x="${x}" y="${y}" width="${w}" height="${h}"/>`}
function frameGeometry(a,width,height,labels){const aspect=APP6D_FRAME_ASPECT[a]||1.5,maxW=labels?Math.min(width*.62,120):width*.9,maxH=labels?Math.min(height*.42,72):height*.9;let h=Math.min(maxH,maxW/aspect),w=h*aspect;if(w>maxW){w=maxW;h=w/aspect}return{x:(width-w)/2,y:labels?Math.max(20,height*.18):Math.max(1,(height-h)/2),w,h}}
function iconGeometry(a,f){if(a==="hostile")return{x:f.x+f.w*.22,y:f.y+f.h*.22,w:f.w*.56,h:f.h*.56};if(a==="unknown")return{x:f.x+f.w*.18,y:f.y+f.h*.18,w:f.w*.64,h:f.h*.64};return{x:f.x+f.w*.08,y:f.y+f.h*.08,w:f.w*.84,h:f.h*.84}}
function unitSymbolSvg(u,opt={}){const width=opt.width||180,height=opt.height||130,labels=opt.labels!==false,f=frameGeometry(u.affiliation,width,height,labels),g=iconGeometry(u.affiliation,f),st=affiliationStyle(u.affiliation),ec=echelon(u.echelonId),label=opt.dark?"#dce6ef":"#172233",muted=opt.dark?"#9fb0c0":"#667786",labelY=f.y+f.h+20;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-frame-aspect="${APP6D_FRAME_ASPECT[u.affiliation]||1.5}" aria-label="${esc(u.name)}"><g fill="none" stroke="${st.stroke}" stroke-width="2" color="${st.stroke}" stroke-linecap="round" stroke-linejoin="round">${frameShape(u.affiliation,f.x,f.y,f.w,f.h).replace("/>",` fill="${st.fill}"/>`)}${glyph(u.unitTypeId,g.x,g.y,g.w,g.h)}</g><text x="${width/2}" y="${Math.max(12,f.y-7)}" text-anchor="middle" fill="${st.stroke}" font-size="${Math.max(9,f.h*.22)}" font-weight="700">${esc(ec.symbol)}</text>${labels?`<text x="${width/2}" y="${labelY}" text-anchor="middle" fill="${label}" font-size="13" font-weight="700">${esc(u.name)}</text><text x="${width/2}" y="${labelY+16}" text-anchor="middle" fill="${muted}" font-size="10">${esc(unitType(u.unitTypeId).name)} · ${esc(ec.name)}</text>`:""}</svg>`}

function modal(title,fields,onConfirm){$("modalTitle").textContent=title;$("modalBody").innerHTML=`<div class="modal-form">${fields}</div>`;$("modal").hidden=false;$("modalConfirm").onclick=()=>{if(onConfirm()!==false)closeModal()}}
function closeModal(){$("modal").hidden=true}
function addUnit(parentId=null){
  modal("部隊を追加",`<label>部隊名<input id="mName" value="新規部隊"></label><label>エシュロン<select id="mEchelon">${selectOptions([...state.echelons].sort((a,b)=>a.rank-b.rank),"battalion",x=>`${x.symbol} ${x.name}`)}</select></label><label>兵科<select id="mType">${selectOptions(state.unitTypes,"infantry")}</select></label>`,()=>{const name=$("mName").value.trim();if(!name)return false;mutate(()=>{const sib=children(parentId);const id=uid("u");state.units.push({id,name,abbr:"",parentId,echelonId:$("mEchelon").value,unitTypeId:$("mType").value,affiliation:"friendly",sortOrder:sib.length?Math.max(...sib.map(x=>x.sortOrder))+1:1,personnel:0,equipment:[],notes:""});selectedId=id;collapsed.delete(parentId)});return true})
}
function deleteUnit(id){const u=unit(id),n=descendants(id).length;if(!u||!confirm(`「${u.name}」${n?`と配下${n}部隊`:""}を削除しますか？`))return;mutate(()=>{const remove=new Set([id,...descendants(id).map(x=>x.id)]);state.units=state.units.filter(x=>!remove.has(x.id));selectedId=state.units[0]?.id||null})}
function duplicateUnit(id){const src=unit(id);if(!src)return;mutate(()=>{const map=new Map();const copyNode=(old,parentId)=>{const nu=clone(old);nu.id=uid("u");nu.name=old===src?`${old.name}（複製）`:old.name;nu.parentId=parentId;nu.sortOrder=children(parentId).length+1;map.set(old.id,nu.id);state.units.push(nu);children(old.id).forEach(c=>copyNode(c,nu.id));return nu};selectedId=copyNode(src,src.parentId).id})}
function moveSibling(id,dir){const u=unit(id),s=children(u.parentId),i=s.findIndex(x=>x.id===id),j=i+dir;if(j<0||j>=s.length)return;mutate(()=>{const tmp=s[i].sortOrder;s[i].sortOrder=s[j].sortOrder;s[j].sortOrder=tmp;if(s[i].sortOrder===s[j].sortOrder){s.forEach((x,k)=>x.sortOrder=k+1)}})}

function renderCatalog(){const q=$("catalogSearch").value.toLowerCase(),limit=300;const matches=state.catalog.filter(x=>!q||`${x.name} ${x.category} ${x.specs}`.toLowerCase().includes(q)).sort((a,b)=>a.category.localeCompare(b.category,"ja")||a.name.localeCompare(b.name,"ja")),rows=matches.slice(0,limit);$("catalogCount").textContent=`全${state.catalog.length.toLocaleString()}件／該当${matches.length.toLocaleString()}件${matches.length>limit?`（先頭${limit}件を表示）`:""}`;$("catalogTable").innerHTML=`<table class="data-table"><thead><tr><th>区分</th><th>品目</th><th>生産国・諸元</th><th>配備先</th><th></th></tr></thead><tbody>${rows.map(x=>{const uses=state.units.filter(u=>(u.equipment||[]).some(a=>a.catalogId===x.id));return `<tr><td>${esc(x.category)}</td><td><strong>${esc(x.name)}</strong></td><td>${esc(x.specs||"")}</td><td>${uses.length?`${uses.length}部隊 / ${uses.reduce((s,u)=>s+int(u.equipment.find(a=>a.catalogId===x.id)?.quantity),0)}`:"—"}</td><td><button data-catalog-edit="${x.id}">編集</button> <button class="danger" data-catalog-delete="${x.id}">削除</button></td></tr>`}).join("")}</tbody></table>`}
function editCatalog(id=null){const item=id?catalogItem(id):{name:"",category:state.categories[0]||"その他",specs:"",notes:""};modal(id?"品目を編集":"品目を追加",`<label>名称<input id="mCatName" value="${esc(item.name)}"></label><label>区分<input id="mCatCategory" list="categoryList" value="${esc(item.category)}"><datalist id="categoryList">${state.categories.map(x=>`<option value="${esc(x)}">`).join("")}</datalist></label><label>諸元<input id="mCatSpecs" value="${esc(item.specs)}"></label><label>備考<textarea id="mCatNotes">${esc(item.notes)}</textarea></label>`,()=>{const name=$("mCatName").value.trim(),category=$("mCatCategory").value.trim()||"その他";if(!name)return false;mutate(()=>{if(!state.categories.includes(category))state.categories.push(category);if(id)Object.assign(catalogItem(id),{name,category,specs:$("mCatSpecs").value,notes:$("mCatNotes").value});else state.catalog.push({id:uid("eq"),name,category,specs:$("mCatSpecs").value,notes:$("mCatNotes").value})});return true})}
function deleteCatalog(id){const x=catalogItem(id),uses=state.units.filter(u=>(u.equipment||[]).some(a=>a.catalogId===id));if(uses.length){alert(`「${x.name}」は ${uses.length} 部隊で使用中です。割当を削除してから再実行してください。\n\n${uses.map(u=>u.name).join("\n")}`);return}if(confirm(`「${x.name}」を削除しますか？`))mutate(()=>state.catalog=state.catalog.filter(c=>c.id!==id))}

function renderSettings(){$("settingsProjectName").value=state.meta.name;$("echelonTable").innerHTML=`<table class="data-table"><thead><tr><th>順位</th><th>名称</th><th>記号</th><th>区分</th><th></th></tr></thead><tbody>${[...state.echelons].sort((a,b)=>a.rank-b.rank).map(x=>`<tr><td>${x.rank}</td><td>${esc(x.name)}</td><td>${esc(x.symbol)}</td><td>${x.brigadeOrAbove?"旅団以上":"旅団未満"}</td><td><button data-echelon-edit="${x.id}">編集</button></td></tr>`).join("")}</tbody></table>`;$("unitTypeTable").innerHTML=`<table class="data-table"><thead><tr><th>名称</th><th>ID</th><th></th></tr></thead><tbody>${state.unitTypes.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.id)}</td><td><button data-type-edit="${x.id}">編集</button></td></tr>`).join("")}</tbody></table>`}
function editEchelon(id=null){const x=id?echelon(id):{name:"",symbol:"",rank:state.echelons.length+1,brigadeOrAbove:false};modal(id?"エシュロン編集":"エシュロン追加",`<label>名称<input id="mEName" value="${esc(x.name)}"></label><label>記号<input id="mESymbol" value="${esc(x.symbol)}"></label><label>順位<input id="mERank" type="number" min="1" value="${x.rank}"></label><label><input id="mEAbove" type="checkbox" ${x.brigadeOrAbove?"checked":""} style="width:auto"> 旅団以上（直接割当不可）</label>`,()=>{const name=$("mEName").value.trim();if(!name)return false;mutate(()=>{const data={name,symbol:$("mESymbol").value,rank:int($("mERank").value),brigadeOrAbove:$("mEAbove").checked};if(id)Object.assign(echelon(id),data);else state.echelons.push({id:uid("ech"),...data})});return true})}
function editUnitType(id=null){const x=id?unitType(id):{name:""};modal(id?"兵科編集":"兵科追加",`<label>名称<input id="mTName" value="${esc(x.name)}"></label><p>既定兵科以外は記号内に「?」を表示します。</p>`,()=>{const name=$("mTName").value.trim();if(!name)return false;mutate(()=>{if(id)unitType(id).name=name;else state.unitTypes.push({id:uid("type"),name})});return true})}

function populateChartRoots(){const current=$("chartRoot").value||selectedId;$("chartRoot").innerHTML=selectOptions(state.units,current,x=>`${x.name}［${echelon(x.echelonId).name}］`);if(!$("chartRoot").value&&state.units[0])$("chartRoot").value=state.units[0].id}
function chartNodes(rootId,maxDepth){const levels=[],walk=(id,depth)=>{if(depth>maxDepth)return;const u=unit(id);if(!u)return;(levels[depth]??=[]).push(u);children(id).forEach(c=>walk(c.id,depth+1))};walk(rootId,0);return levels}
function renderChart(){
  const rootId=$("chartRoot").value||selectedId||state.units[0]?.id;if(!rootId){$("chartCanvas").innerHTML="";return}const maxDepth=Number($("chartDepth").value),levels=chartNodes(rootId,maxDepth);const nodeW=170,nodeH=135,gapX=45,gapY=100,connectorEndGap=14,maxCount=Math.max(...levels.map(x=>x.length)),width=Math.max(900,maxCount*(nodeW+gapX)+80),height=Math.max(600,levels.length*(nodeH+gapY)+80);const pos=new Map();levels.forEach((list,d)=>{const total=list.length*nodeW+(list.length-1)*gapX,offset=(width-total)/2;list.forEach((u,i)=>pos.set(u.id,{x:offset+i*(nodeW+gapX),y:40+d*(nodeH+gapY)}))});let lines="";pos.forEach((p,id)=>children(id).forEach(c=>{const q=pos.get(c.id);if(q){const endY=q.y-connectorEndGap;lines+=`<path data-from="${id}" data-to="${c.id}" data-node-y="${q.y}" data-end-y="${endY}" d="M${p.x+nodeW/2} ${p.y+nodeH}V${p.y+nodeH+gapY*.42}H${q.x+nodeW/2}V${endY}"/>`}}));const nodes=[...pos].map(([id,p])=>{const u=unit(id),agg=aggregate(id),eq=Object.entries(agg.equipment).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>`${catalogItem(k)?.name||k} ${v}`).join(" / ");return `<g class="org-node" data-id="${id}" transform="translate(${p.x} ${p.y})">${unitSymbolSvg(u,{width:nodeW,height:100,labels:true,dark:false})}${$("showPersonnel").checked?`<text x="${nodeW/2}" y="115" text-anchor="middle" font-size="10" fill="#526171">人員 ${agg.personnel.toLocaleString()}</text>`:""}${$("showEquipment").checked?`<text x="${nodeW/2}" y="130" text-anchor="middle" font-size="9" fill="#526171">${esc(eq||"装備なし")}</text>`:""}</g>`}).join("");const svg=`<svg id="orgSvg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><g fill="none" stroke="#7890a5" stroke-width="1.5">${lines}</g>${nodes}</svg>`;$("chartCanvas").className="chart-canvas";$("chartCanvas").innerHTML=svg;applyChartTransform();
}
function applyChartTransform(){$("chartCanvas").style.transform=`translate(${chartPan.x}px,${chartPan.y}px) scale(${chartZoom})`;$("zoomResetBtn").textContent=`${Math.round(chartZoom*100)}%`}
function exportSvg(){const svg=$("orgSvg");if(!svg)return;download(`${state.meta.name}-組織図.svg`,new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`],{type:"image/svg+xml"}))}
function exportPng(){const svg=$("orgSvg");if(!svg)return;const data=new XMLSerializer().serializeToString(svg),url=URL.createObjectURL(new Blob([data],{type:"image/svg+xml"})),img=new Image();img.onload=()=>{const canvas=document.createElement("canvas"),scale=2;canvas.width=svg.width.baseVal.value*scale;canvas.height=svg.height.baseVal.value*scale;const ctx=canvas.getContext("2d");ctx.scale(scale,scale);ctx.drawImage(img,0,0);canvas.toBlob(blob=>download(`${state.meta.name}-組織図.png`,blob),"image/png");URL.revokeObjectURL(url)};img.src=url}

function saveJson(){const violations=state.units.filter(u=>isAggregateOnly(u)&&((u.equipment||[]).length||u.personnel));if(violations.length&&!confirm(`${violations.length}件の旅団以上部隊に直接割当データがあります。警告を含む状態で保存しますか？`))return;state.meta.updatedAt=new Date().toISOString();download(`${state.meta.name}.orbat.json`,new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));dirty=false;updateHeader();toast("プロジェクトを保存しました")}
function exportRollup(kind="csv"){const rows=[["部隊","エシュロン","人員","兵器区分","品目","数量"]];state.units.forEach(u=>{const a=aggregate(u.id),entries=Object.entries(a.equipment);if(!entries.length)rows.push([u.name,echelon(u.echelonId).name,a.personnel,"","",0]);entries.forEach(([id,q])=>{const c=catalogItem(id);rows.push([u.name,echelon(u.echelonId).name,a.personnel,c?.category||"不明",c?.name||id,q])})});if(kind==="md"){const text=`| ${rows[0].join(" | ")} |\n|${rows[0].map(()=>"---").join("|")}|\n`+rows.slice(1).map(r=>`| ${r.join(" | ")} |`).join("\n");download(`${state.meta.name}-集計.md`,new Blob([text],{type:"text/markdown"}))}else{const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");download(`${state.meta.name}-集計.csv`,new Blob(["\ufeff"+csv],{type:"text/csv"}))}}

function bind(){
  document.querySelectorAll(".view-btn").forEach(b=>b.onclick=()=>switchView(b.dataset.view));$("addRootBtn").onclick=()=>addUnit(null);$("undoBtn").onclick=undo;$("redoBtn").onclick=redo;$("saveBtn").onclick=saveJson;$("openBtn").onclick=()=>$("fileInput").click();$("newBtn").onclick=()=>{if(dirty&&!confirm("未保存の変更を破棄しますか？"))return;state=sampleProject();history=[];future=[];selectedId="u-bde";dirty=false;renderAll()};
  $("fileInput").onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());validateProject(data);const added=mergeBuiltInCatalog(data);state=data;state.units.forEach(u=>{u.equipment??=[];u.affiliation??="friendly";u.sortOrder??=1});history=[];future=[];selectedId=state.units[0]?.id;dirty=added>0;renderAll();toast(`プロジェクトを読み込みました${added?`（兵器${added}件を補完）`:""}`)}catch(err){alert(`読込に失敗しました: ${err.message}`)}e.target.value=""};
  $("unitTree").onclick=e=>{const b=e.target.closest("[data-action]");if(!b)return;const {action,id}=b.dataset;if(action==="select"){selectedId=id;renderAll()}if(action==="toggle"){collapsed.has(id)?collapsed.delete(id):collapsed.add(id);renderTree()}if(action==="add")addUnit(id);if(action==="up")moveSibling(id,-1);if(action==="down")moveSibling(id,1)};
  $("treeSearch").oninput=renderTree;$("expandAllBtn").onclick=()=>{collapsed.clear();renderTree()};$("collapseAllBtn").onclick=()=>{collapsed=new Set(state.units.map(x=>x.id));renderTree()};
  const fieldMap={unitName:"name",unitAbbr:"abbr",unitEchelon:"echelonId",unitType:"unitTypeId",unitAffiliation:"affiliation",unitNotes:"notes"};Object.entries(fieldMap).forEach(([id,key])=>$(id).onchange=()=>mutate(()=>unit(selectedId)[key]=$(id).value));
  $("unitParent").onchange=()=>mutate(()=>{const u=unit(selectedId);u.parentId=$("unitParent").value||null;u.sortOrder=children(u.parentId).length+1});$("unitPersonnel").onchange=()=>mutate(()=>unit(selectedId).personnel=int($("unitPersonnel").value));$("duplicateBtn").onclick=()=>duplicateUnit(selectedId);$("deleteUnitBtn").onclick=()=>deleteUnit(selectedId);$("openChartForUnit").onclick=()=>{$("chartRoot").value=selectedId;switchView("chart")};
  $("addEquipmentBtn").onclick=()=>{const id=$("equipmentPicker").value,q=int($("equipmentQty").value);if(!id||!q)return;mutate(()=>{const list=unit(selectedId).equipment??=[];const old=list.find(x=>x.catalogId===id);old?old.quantity+=q:list.push({catalogId:id,quantity:q})})};$("directEquipment").onchange=e=>{if(!e.target.classList.contains("assignment-qty"))return;mutate(()=>{const a=unit(selectedId).equipment.find(x=>x.catalogId===e.target.dataset.id);a.quantity=int(e.target.value);unit(selectedId).equipment=unit(selectedId).equipment.filter(x=>x.quantity>0)})};$("directEquipment").onclick=e=>{const b=e.target.closest(".assignment-delete");if(b)mutate(()=>unit(selectedId).equipment=unit(selectedId).equipment.filter(x=>x.catalogId!==b.dataset.id))};
  $("addCatalogBtn").onclick=()=>editCatalog();$("catalogSearch").oninput=renderCatalog;$("catalogTable").onclick=e=>{const ed=e.target.closest("[data-catalog-edit]"),del=e.target.closest("[data-catalog-delete]");if(ed)editCatalog(ed.dataset.catalogEdit);if(del)deleteCatalog(del.dataset.catalogDelete)};$("importCsvBtn").onclick=()=>$("csvInput").click();$("csvInput").onchange=async e=>{const text=await e.target.files[0].text(),lines=text.replace(/^\ufeff/,"").split(/\r?\n/).filter(Boolean),head=lines.shift().split(",").map(x=>x.trim().toLowerCase());const parse=line=>line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g).map(x=>x.replace(/,$/,"").replace(/^"|"$/g,"").replaceAll('""','"'));mutate(()=>lines.forEach(line=>{const v=parse(line),o=Object.fromEntries(head.map((h,i)=>[h,v[i]||""]));if(o.name){const category=o.category||"その他";if(!state.categories.includes(category))state.categories.push(category);state.catalog.push({id:uid("eq"),name:o.name,category,specs:o.specs||"",notes:o.notes||""})}}));e.target.value="";toast(`${lines.length}品目を取り込みました`)};
  $("settingsProjectName").onchange=()=>mutate(()=>state.meta.name=$("settingsProjectName").value.trim()||"名称未設定");$("addEchelonBtn").onclick=()=>editEchelon();$("addUnitTypeBtn").onclick=()=>editUnitType();$("echelonTable").onclick=e=>{const b=e.target.closest("[data-echelon-edit]");if(b)editEchelon(b.dataset.echelonEdit)};$("unitTypeTable").onclick=e=>{const b=e.target.closest("[data-type-edit]");if(b)editUnitType(b.dataset.typeEdit)};
  ["chartRoot","chartDepth","showPersonnel","showEquipment"].forEach(id=>$(id).onchange=renderChart);$("zoomInBtn").onclick=()=>{chartZoom=Math.min(2.5,chartZoom+.15);applyChartTransform()};$("zoomOutBtn").onclick=()=>{chartZoom=Math.max(.25,chartZoom-.15);applyChartTransform()};$("zoomResetBtn").onclick=()=>{chartZoom=1;chartPan={x:40,y:40};applyChartTransform()};$("exportCsvBtn").onclick=()=>exportRollup("csv");$("exportMdBtn").onclick=()=>exportRollup("md");$("exportSvgBtn").onclick=exportSvg;$("exportPngBtn").onclick=exportPng;$("chartCanvas").onclick=e=>{const n=e.target.closest(".org-node");if(n){selectedId=n.dataset.id;switchView("editor")}};
  $("chartViewport").onmousedown=e=>{panStart={x:e.clientX-chartPan.x,y:e.clientY-chartPan.y};$("chartViewport").classList.add("dragging")};window.addEventListener("mousemove",e=>{if(!panStart)return;chartPan={x:e.clientX-panStart.x,y:e.clientY-panStart.y};applyChartTransform()});window.addEventListener("mouseup",()=>{panStart=null;$("chartViewport").classList.remove("dragging")});$("chartViewport").addEventListener("wheel",e=>{e.preventDefault();chartZoom=Math.max(.25,Math.min(2.5,chartZoom+(e.deltaY<0?.1:-.1)));applyChartTransform()},{passive:false});
  $("modalClose").onclick=$("modalCancel").onclick=closeModal;$("modal").onclick=e=>{if(e.target===$("modal"))closeModal()};window.addEventListener("beforeunload",e=>{if(dirty){e.preventDefault();e.returnValue=""}});window.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();saveJson()}});
}

bind();renderAll();
