// ================= CONFIG =================
const SUPABASE_URL = "TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "TU_ANON_KEY";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let vista = "hist";

// ================= UTIL =================
function getCliente() {
  const params = new URLSearchParams(window.location.search);
  const c = params.get("c");

  if (c && c.trim() !== "") return c.trim();

  // fallback por si se abre directo
  return (
    localStorage.getItem("cod_cliente") ||
    localStorage.getItem("codCliente") ||
    localStorage.getItem("cliente") ||
    ""
  ).trim();
}

function mostrar(tab) {
  vista = tab;

  document.querySelectorAll(".tabs button")
    .forEach(b => b.classList.remove("active"));

  document.getElementById("tab" + tab.charAt(0).toUpperCase() + tab.slice(1))
    .classList.add("active");

  cargar();
}

// ================= CARGA PRINCIPAL =================
async function cargar() {

  const cliente = getCliente();
  const cont = document.getElementById("contenido");
  const info = document.getElementById("clienteInfo");

  if (!cliente) {
    cont.innerHTML = "<p>No se detectó cliente logueado.</p>";
    return;
  }

  info.textContent = "Cliente: " + cliente;
  cont.innerHTML = "Cargando...";

  if (vista === "hist") {
    return cargarHistorial(cliente);
  }
  if (vista === "sug") {
    return cargarSugerencias(cliente);
  }
  if (vista === "nov") {
    return cargarNovedades(cliente);
  }
}

// ================= HISTORIAL =================
async function cargarHistorial(cliente) {

  const { data, error } = await supabase
    .rpc("pivot_cliente_mensual", { p_cliente: cliente });

  if (error) {
    document.getElementById("contenido").innerHTML =
      "<p>Error al cargar historial.</p>";
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    document.getElementById("contenido").innerHTML =
      "<p>No hay datos.</p>";
    return;
  }

  let html = "<table><thead><tr>";

  Object.keys(data[0]).forEach(col => {
    html += `<th>${col}</th>`;
  });

  html += "</tr></thead><tbody>";

  data.forEach(row => {
    html += "<tr>";
    Object.values(row).forEach(val => {
      html += `<td>${val ?? ""}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";

  document.getElementById("contenido").innerHTML = html;
}

// ================= SUGERENCIAS =================
async function cargarSugerencias(cliente) {

  const { data, error } = await supabase
    .rpc("sugerencias_cliente", { p_cliente: cliente });

  if (error) {
    document.getElementById("contenido").innerHTML =
      "<p>Error al cargar sugerencias.</p>";
    return;
  }

  renderTablaSimple(data);
}

// ================= NOVEDADES =================
async function cargarNovedades(cliente) {

  const { data, error } = await supabase
    .rpc("novedades_cliente", { p_cliente: cliente });

  if (error) {
    document.getElementById("contenido").innerHTML =
      "<p>Error al cargar novedades.</p>";
    return;
  }

  renderTablaSimple(data);
}

// ================= RENDER SIMPLE =================
function renderTablaSimple(data) {

  if (!data || data.length === 0) {
    document.getElementById("contenido").innerHTML =
      "<p>No hay datos.</p>";
    return;
  }

  let html = "<table><thead><tr>";

  Object.keys(data[0]).forEach(col => {
    html += `<th>${col}</th>`;
  });

  html += "</tr></thead><tbody>";

  data.forEach(row => {
    html += "<tr>";
    Object.values(row).forEach(val => {
      html += `<td>${val ?? ""}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";

  document.getElementById("contenido").innerHTML = html;
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", () => {
  cargar();
});
