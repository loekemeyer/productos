// ====================== CONFIG ======================
const SUPABASE_URL = "https://flgavcfamdsodrhakqen.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_G9QvEtPwGp80_6NUneseVg_V5mfmLfY";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================== STATE ======================
let vista = "hist";

let sugerenciasGlobal = [];
let sugMostrados = 5;

let novedadesGlobal = [];
let novMostrados = 5;

// ====================== HELPERS ======================
function qs(id){ return document.getElementById(id); }

function getClienteFromUrlOrStorage(){
  const params = new URLSearchParams(window.location.search);
  const c = (params.get("c") || "").trim();
  if (c) return c;

  // fallback (ajusté varias keys comunes por si cambia tu login)
  return (
    localStorage.getItem("cod_cliente") ||
    localStorage.getItem("codCliente") ||
    localStorage.getItem("cliente") ||
    localStorage.getItem("customer") ||
    localStorage.getItem("customer_id") ||
    ""
  ).trim();
}

function getVistaFromUrl(){
  const params = new URLSearchParams(window.location.search);
  const v = (params.get("v") || "").trim().toLowerCase();
  if (v === "hist" || v === "sug" || v === "nov") return v;
  return "hist";
}

function setEstado(txt){
  qs("estado").textContent = txt;
}

function mostrar(which){
  vista = which;

  qs("modHist").classList.toggle("hidden", which !== "hist");
  qs("modSug").classList.toggle("hidden", which !== "sug");
  qs("modNov").classList.toggle("hidden", which !== "nov");

  qs("tabHist").classList.toggle("active", which === "hist");
  qs("tabSug").classList.toggle("active", which === "sug");
  qs("tabNov").classList.toggle("active", which === "nov");
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTable(targetId, data){
  const el = qs(targetId);
  if (!data || data.length === 0){
    el.innerHTML = `<div class="empty">No hay datos.</div>`;
    return;
  }

  const cols = Object.keys(data[0]);
  let html = `<div class="tablewrap"><table><thead><tr>`;
  for (const c of cols) html += `<th>${escapeHtml(c)}</th>`;
  html += `</tr></thead><tbody>`;

  for (const row of data){
    html += `<tr>`;
    for (const c of cols){
      html += `<td>${escapeHtml(row[c])}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

// ====================== LOADERS ======================
async function cargarHistorial(cliente){
  setEstado("Cargando historial…");

  const { data, error } = await sb.rpc("pivot_cliente_mensual", { p_cliente: cliente });

  if (error){
    console.error(error);
    setEstado("Error al cargar historial.");
    qs("modHist").innerHTML = `<div class="empty">Error al cargar historial.</div>`;
    return;
  }

  if (!data || data.length === 0){
    setEstado("Sin datos de historial.");
    qs("modHist").innerHTML = `<div class="empty">No hay datos.</div>`;
    return;
  }

  // render en modHist
  qs("modHist").innerHTML = `<div id="tablaHist"></div>`;
  renderTable("tablaHist", data);
  setEstado("Historial cargado.");
}

async function cargarSugerencias(cliente){
  setEstado("Cargando sugerencias…");

  const { data, error } = await sb.rpc("sugerencias_cliente", { p_cliente: cliente });

  if (error){
    console.error(error);
    setEstado("Error al cargar sugerencias.");
    qs("tablaSug").innerHTML = `<div class="empty">Error al cargar sugerencias.</div>`;
    return;
  }

  sugerenciasGlobal = Array.isArray(data) ? data : [];
  sugMostrados = 5;

  if (sugerenciasGlobal.length === 0){
    setEstado("Sin sugerencias.");
    qs("tablaSug").innerHTML = `<div class="empty">No hay sugerencias.</div>`;
    return;
  }

  renderTable("tablaSug", sugerenciasGlobal.slice(0, sugMostrados));
  setEstado("Sugerencias cargadas.");
}

async function cargarNovedades(cliente){
  setEstado("Cargando novedades…");

  const { data, error } = await sb.rpc("novedades_cliente", { p_cliente: cliente });

  if (error){
    console.error(error);
    setEstado("Error al cargar novedades.");
    qs("tablaNov").innerHTML = `<div class="empty">Error al cargar novedades.</div>`;
    return;
  }

  novedadesGlobal = Array.isArray(data) ? data : [];
  novMostrados = 5;

  if (novedadesGlobal.length === 0){
    setEstado("Sin novedades.");
    qs("tablaNov").innerHTML = `<div class="empty">No hay novedades.</div>`;
    return;
  }

  renderTable("tablaNov", novedadesGlobal.slice(0, novMostrados));
  setEstado("Novedades cargadas.");
}

async function cargarVista(){
  const cliente = getClienteFromUrlOrStorage();

  if (!cliente){
    setEstado("No se detectó cliente logueado.");
    qs("clienteInfo").textContent = "";
    qs("modHist").innerHTML = `<div class="empty">No se detectó cliente logueado. Volvé a Mayorista e ingresá.</div>`;
    return;
  }

  qs("clienteInfo").textContent = `Cliente: ${cliente}`;

  if (vista === "hist") return cargarHistorial(cliente);
  if (vista === "sug")  return cargarSugerencias(cliente);
  if (vista === "nov")  return cargarNovedades(cliente);
}

// ====================== INIT ======================
document.addEventListener("DOMContentLoaded", () => {
  // vista inicial desde URL (?v=hist|sug|nov)
  mostrar(getVistaFromUrl());

  // tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      mostrar(btn.dataset.tab);
      cargarVista();
    });
  });

  // ver más
  qs("btnMasSug").addEventListener("click", () => {
    sugMostrados += 5;
    renderTable("tablaSug", sugerenciasGlobal.slice(0, sugMostrados));
  });

  qs("btnMasNov").addEventListener("click", () => {
    novMostrados += 5;
    renderTable("tablaNov", novedadesGlobal.slice(0, novMostrados));
  });

  // back / recargar
  qs("btnBack").addEventListener("click", () => {
    // vuelve a mayorista (si querés, podés poner hash #profile)
    window.location.href = "./mayorista.html";
  });

  qs("btnRecargar").addEventListener("click", () => cargarVista());

  // cargar automático al abrir
  cargarVista();
});
