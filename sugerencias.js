/// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3a2Nsd2htb3lndW5xbWxlZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjA2NzUsImV4cCI6MjA4NTA5NjY3NX0.soqPY5hfA3RkAJ9jmIms8UtEGUc4WpZztpEbmDijOgU";

// ================= IMÁGENES (igual que mayorista) =================
const BASE_IMG = `${SUPABASE_URL}/storage/v1/object/public/products-images/`;
// si no querés cache, podés usar Date.now()
const IMG_VERSION = "1";

function imgUrlByCod(cod) {
  const c = String(cod || "").trim();
  if (!c) return "img/no-image.jpg";
  return `${BASE_IMG}${encodeURIComponent(c)}.jpg?v=${encodeURIComponent(IMG_VERSION)}`;
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= UI HELPERS =================
const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  $("status").style.display = "block";
  $("status").innerText = msg;
}

function showTable(show) {
  $("tablaSug").style.display = show ? "table" : "none";
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
      return obj[k];
  }
  return fallback;
}

function fmtPrecio(n) {
  const val = Number(n);
  if (isNaN(val)) return "";
  return val.toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

// ================= STATE =================
let cliente = null;
let sugerenciasGlobal = [];
let sugMostrados = 10;

// ================= AUTH =================
async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("getSession error:", error);
    setStatus("Error de sesión.");
    return null;
  }
  if (!data?.session) {
    setStatus("No hay sesión iniciada. Volviendo a Mayorista…");
    setTimeout(() => (location.href = "./mayorista.html"), 800);
    return null;
  }

  console.log("SUGERENCIAS session user:", data.session.user?.id); // ✅ DEBUG

  return data.session;
}
async function getCliente(session) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("getCliente error:", error);
    setStatus("No se pudo cargar el cliente (RLS o datos).");
    return null;
  }
  if (!data) {
    setStatus("No se encontró tu cliente asociado. (customers.auth_user_id)");
    return null;
  }
  return data;
}

// ================= DATA (RPC) =================
async function loadSugerencias(codCliente) {
  const { data, error } = await sb.rpc("sugerencias_cliente", {
    p_customer: String(codCliente),
  });

  if (error) {
    console.error("RPC sugerencias_cliente error:", error);
    setStatus(
      "No existe/funciona sugerencias_cliente en esta Supabase (hay que migrar la RPC).",
    );
    sugerenciasGlobal = [];
    renderSug();
    return;
  }

  sugerenciasGlobal = data || [];
  sugMostrados = 10;
  renderSug();
  setStatus("");
}

// ================= RENDER =================
function renderSug() {
  const thead = $("theadSug");
  const tbody = $("tbodySug");

 thead.innerHTML = `
  <tr>
    <th style="width:120px">Img</th>
    <th style="width:80px">Cod</th>
    <th>Descripción</th>
    <th style="width:70px">UxB</th>
    <th style="width:120px">Precio</th>
    <th style="width:300px">Motivo</th>
    <th style="width:220px">Pedido</th>
  </tr>
`;

  tbody.innerHTML = "";

  const slice = sugerenciasGlobal.slice(0, sugMostrados);

  slice.forEach((r) => {
    const cod = pick(r, ["cod", "codigo", "item_code"]);
    const desc = pick(r, ["description", "descripcion", "articulo"]);
    const uxb = pick(r, ["uxb"]);
    const price = pick(r, ["price_cash", "list_price", "precio"]);
    const msg = pick(r, ["texto_clientes", "mensaje", "texto"], "");
    const imgUrl = pick(r, ["image_url", "img", "image"], "");
    const pid = String(pick(r, ["product_id", "id", "productId"], "")).trim();

 tbody.innerHTML += `
  <tr>
    <td class="imgcell">
      <img
        class="sug-img"
        src="${imgUrlByCod(cod)}"
        alt="${String(desc || "")}"
        onerror="this.onerror=null;this.src='img/no-image.jpg'"
      />
    </td>
    <td>${cod}</td>
    <td class="desc">${desc}</td>
    <td>${uxb}</td>
    <td>${fmtPrecio(price)}</td>
    <td class="msg">${msg}</td>
    <td>
      <div class="sug-action">
        <div class="sug-stepper">
          <button type="button" class="sug-step-btn" onclick="sugDec('${pid}')">−</button>
          <input id="sugqty-${pid}" class="sug-step-in" type="number" min="1" value="1" />
          <button type="button" class="sug-step-btn" onclick="sugInc('${pid}')">+</button>
        </div>

        <button
          type="button"
          class="sug-add-btn"
          id="sugadd-${pid}"
          onclick="sugAdd('${pid}')"
          ${pid ? "" : "disabled"}
          title="${pid ? "" : "Falta product_id en la sugerencia"}"
        >
          Agregar al pedido
        </button>
      </div>
    </td>
  </tr>
`;
  });

  showTable(true);

  $("btnMoreSug").classList.toggle(
    "hidden",
    sugerenciasGlobal.length <= sugMostrados,
  );
  $("btnLessSug").classList.toggle("hidden", sugMostrados <= 10);
}

// ================= INIT =================
async function init() {
  try {
    setStatus("Cargando…");

    $("btnVolver").addEventListener(
      "click",
      () => (location.href = "./mayorista.html"),
    );
    $("btnReload").addEventListener("click", () => {
      if (!cliente?.cod_cliente) return;
      loadSugerencias(cliente.cod_cliente);
    });

    $("btnMoreSug").addEventListener("click", () => {
      sugMostrados += 20;
      renderSug();
    });
    $("btnLessSug").addEventListener("click", () => {
      sugMostrados = 10;
      renderSug();
    });

    const session = await getSession();
    if (!session) return;

    cliente = await getCliente(session);
    if (!cliente) return;

    $("cliente").innerText =
      `Cliente: ${cliente.business_name} (${cliente.cod_cliente})`;

    await loadSugerencias(cliente.cod_cliente);
  } catch (e) {
    console.error("Init crash:", e);
    setStatus("Error inesperado. Ver consola.");
  }
}

document.addEventListener("DOMContentLoaded", init);

// ================= CARRITO (shared con mayorista) =================
const CART_LS_KEY = "lk_mayorista_cart_v1";

function readCartLS() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCartLS(arr) {
  try {
    localStorage.setItem(CART_LS_KEY, JSON.stringify(arr));
  } catch {}
}

function addToCartLS(productId, qtyCajas) {
  const pid = String(productId || "").trim();
  const q = Math.max(1, parseInt(qtyCajas, 10) || 1);
  if (!pid) return;

  const cart = readCartLS();
  const found = cart.find((x) => String(x.productId) === pid);

  if (found) {
    found.qtyCajas = Math.max(1, (parseInt(found.qtyCajas, 10) || 0) + q);
  } else {
    cart.push({ productId: pid, qtyCajas: q });
  }

  writeCartLS(cart);
}

// Handlers globales para onclick del HTML
window.sugDec = function (pid) {
  const el = document.getElementById(`sugqty-${pid}`);
  if (!el) return;
  const v = Math.max(1, (parseInt(el.value, 10) || 1) - 1);
  el.value = v;
};

window.sugInc = function (pid) {
  const el = document.getElementById(`sugqty-${pid}`);
  if (!el) return;
  el.value = Math.max(1, (parseInt(el.value, 10) || 1) + 1);
};

window.sugAdd = function (pid) {
  const el = document.getElementById(`sugqty-${pid}`);
  const qty = el ? parseInt(el.value, 10) || 1 : 1;

  addToCartLS(pid, qty);

  // feedback visual rápido
  const btn = document.getElementById(`sugadd-${pid}`);
  if (btn) {
    const prev = btn.textContent;
    btn.textContent = "Agregado ✓";
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, 900);
  }
};