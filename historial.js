// ====================== CONFIG ======================
const SUPABASE_URL = "https://flgavcfamdsodrhakqen.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_G9QvEtPwGp80_6NUneseVg_V5mfmLfY";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================== STATE ======================
let vista = "hist";

// sugerencias
let sugerenciasGlobal = [];
let sugMostrados = 5;

// novedades
let novedadesGlobal = [];
let novMostrados = 5;

// ====================== UI ======================
function mostrar(which){
  vista = which;

  document.getElementById("modHist").classList.toggle("hidden", which !== "hist");
  document.getElementById("modSug").classList.toggle("hidden", which !== "sug");
  document.getElementById("modNov").classList.toggle("hidden", which !== "nov");

  document.getElementById("tabHist").classList.toggle("active", which === "hist");
  document.getElementById("tabSug").classList.toggle("active", which === "sug");
  document.getElementById("tabNov").classList.toggle("active", which === "nov");
}

async function cargar(){
  const cliente = document.getElementById("cliente").value.trim();
  if(!cliente) return;

  if(vista === "hist") return cargarHistorial(cliente);
  if(vista === "sug")  return cargarSugerencias(cliente);
  if(vista === "nov")  return cargarNovedades(cliente);
}

function showRpcError(modulo, error){
  console.log(`${modulo} error:`, error);
  const msg = error?.message || JSON.stringify(error);
  alert(`Error cargando ${modulo}: ${msg}`);
}

// ====================== FORMATS ======================
function fmtMes(yyyy_mm){
  if(!yyyy_mm || typeof yyyy_mm !== "string") return "";
  const [yyyy, mm] = yyyy_mm.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const idx = Number(mm) - 1;
  const nom = (idx >= 0 && idx < 12) ? meses[idx] : mm;
  const yy = String(yyyy || "").slice(-2);
  return `${nom}/${yy}`;
}

function fmtPrecio(n){
  if(n === null || n === undefined || n === "") return "";
  const val = Number(n);
  if(Number.isNaN(val)) return "";
  return val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fotoCell(url){
  const u = (url || "").trim();
  if(!u) return "";
  return `<a href="${u}" target="_blank" rel="noopener">
            <img class="thumb" src="${u}" alt="">
          </a>`;
}

function pctFromTexto(texto){
  if(!texto) return null;
  const m = String(texto).match(/(\d{1,3})\s*%/);
  if(!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : n;
}

// 🔥 a partir de 70%
function fuegoPrefix(texto_clientes){
  const p = pctFromTexto(texto_clientes);
  return (p !== null && p >= 70) ? "🔥 " : "";
}

// ====================== HISTORIAL ======================
async function cargarHistorial(cliente){
  const { data, error } = await sb.rpc("pivot_cliente_mensual", { p_customer: cliente });
  if(error){
    showRpcError("Historial", error);
    return;
  }
  if(!data || data.length === 0){
    alert("Historial: sin datos para ese cliente.");
    document.querySelector("#tablaHist thead").innerHTML = "";
    document.querySelector("#tablaHist tbody").innerHTML = "";
    return;
  }

  const months = data[0].months_order || [];
  const thead = document.querySelector("#tablaHist thead");
  const tbody = document.querySelector("#tablaHist tbody");

  thead.innerHTML = "";
  tbody.innerHTML = "";

  let head = `<tr>
    <th class="col-cod">Cod</th>
    <th class="col-desc">Descripción</th>
    <th>Total</th>`;

  months.forEach(m => head += `<th>${fmtMes(m)}</th>`);
  head += `</tr>`;
  thead.innerHTML = head;

  data.forEach(r => {
    let row = `<tr>
      <td class="col-cod">${r.cod ?? ""}</td>
      <td class="col-desc">${r.description || ""}</td>
      <td>${r.total ?? ""}</td>`;

    months.forEach(m => {
      row += `<td>${(r.by_month && r.by_month[m]) ? r.by_month[m] : ""}</td>`;
    });

    row += `</tr>`;
    tbody.innerHTML += row;
  });
}

// ====================== SUGERENCIAS ======================
async function cargarSugerencias(cliente){
  const { data, error } = await sb.rpc("sugerencias_cliente", { p_customer: cliente });
  if(error){
    showRpcError("Sugerencias", error);
    return;
  }

  sugerenciasGlobal = data || [];
  sugMostrados = 5;
  renderSug();
}

function renderSug(){
  const thead = document.querySelector("#tablaSug thead");
  const tbody = document.querySelector("#tablaSug tbody");
  const btnMore = document.getElementById("btnMoreSug");
  const btnLess = document.getElementById("btnLessSug");

  thead.innerHTML = `
    <tr>
      <th class="col-cod">Cod</th>
      <th class="col-desc">Descripción</th>
      <th class="col-img">Foto</th>
      <th class="col-uxb">UxB</th>
      <th class="col-price">Tu Precio Contado</th>
      <th class="col-msg"></th>
    </tr>`;

  tbody.innerHTML = "";

  const sorted = [...sugerenciasGlobal].sort((a,b)=>{
    const ra = (a.ranking_global ?? 999999);
    const rb = (b.ranking_global ?? 999999);
    return ra - rb;
  });

  sorted.slice(0, sugMostrados).forEach(r => {
    const texto = (r.texto_clientes || "").trim();

    let textoFinal = texto;
    if(!textoFinal && r.pct_clientes !== undefined && r.pct_clientes !== null){
      textoFinal = `${Math.round(Number(r.pct_clientes))}% de los clientes ya compran este artículo`;
    }

    tbody.innerHTML += `
      <tr>
        <td class="col-cod">${r.cod ?? ""}</td>
        <td class="col-desc">${r.description || ""}</td>
        <td class="col-img">${fotoCell(r.image_url)}</td>
        <td class="col-uxb">${r.uxb ?? ""}</td>
        <td class="col-price">${fmtPrecio(r.price_cash)}</td>
        <td class="col-msg">${fuegoPrefix(textoFinal)}${textoFinal}</td>
      </tr>`;
  });

  btnMore.classList.toggle("hidden", sugMostrados >= sorted.length);
  btnLess.classList.toggle("hidden", sugMostrados <= 5);
}

function verMasSug(){
  sugMostrados += 15;
  renderSug();
}
function verMenosSug(){
  sugMostrados = 5;
  renderSug();
}

// ====================== NOVEDADES ======================
async function cargarNovedades(cliente){
  const { data, error } = await sb.rpc("novedades_cliente", {
    p_customer: cliente,
    p_limit: 50,
    p_min_clients: 10
  });

  if(error){
    showRpcError("Novedades", error);
    return;
  }

  novedadesGlobal = data || [];
  novMostrados = 5;
  renderNov();
}

function renderNov(){
  const thead = document.querySelector("#tablaNov thead");
  const tbody = document.querySelector("#tablaNov tbody");
  const btnMore = document.getElementById("btnMoreNov");
  const btnLess = document.getElementById("btnLessNov");

  thead.innerHTML = `
    <tr>
      <th class="col-cod">Cod</th>
      <th class="col-desc">Descripción</th>
      <th class="col-img">Foto</th>
      <th class="col-uxb">UxB</th>
      <th class="col-price">Tu Precio Contado</th>
    </tr>`;

  tbody.innerHTML = "";

  novedadesGlobal.slice(0, novMostrados).forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td class="col-cod">${r.cod ?? ""}</td>
        <td class="col-desc">${r.description || ""}</td>
        <td class="col-img">${fotoCell(r.image_url)}</td>
        <td class="col-uxb">${r.uxb ?? ""}</td>
        <td class="col-price">${fmtPrecio(r.price_cash)}</td>
      </tr>`;
  });

  btnMore.classList.toggle("hidden", novMostrados >= novedadesGlobal.length);
  btnLess.classList.toggle("hidden", novMostrados <= 5);
}

function verMasNov(){
  novMostrados += 15;
  renderNov();
}
function verMenosNov(){
  novMostrados = 5;
  renderNov();
}

// ====================== INIT ======================
mostrar("hist");