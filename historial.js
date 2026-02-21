// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// helpers
const $ = id => document.getElementById(id);
const statusBox = $("status");
const tabla = $("tabla");
const thead = $("thead");
const tbody = $("tbody");

// ================= LOGIN =================
async function getSession(){
  const { data } = await supabase.auth.getSession();
  if(!data.session){
    location.href = "../mayorista.html";
    return null;
  }
  return data.session;
}

// ================= PERFIL =================
async function getCliente(session){
  const { data } = await supabase
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("auth_user_id", session.user.id)
    .single();

  return data;
}

// ================= DATA =================
async function getSales(codCliente){
  const { data, error } = await supabase
    .from("sales_lines")
    .select("invoice_date, item_code, boxes")
    .eq("customer_code", String(codCliente));

  if(error){
    console.log(error);
    statusBox.innerText = "Error cargando ventas";
    return [];
  }

  return data;
}

// ================= RENDER =================
function renderTabla(rows){

  if(!rows.length){
    statusBox.innerText = "Sin datos";
    return;
  }

  // meses únicos
  const mesesSet = new Set();
  rows.forEach(r=>{
    const d = new Date(r.invoice_date);
    const key = `${d.getFullYear()}-${d.getMonth()+1}`;
    mesesSet.add(key);
  });

  const meses = Array.from(mesesSet).sort((a,b)=> new Date(a) - new Date(b));

  // agrupar por producto
  const map = {};

  rows.forEach(r=>{
    const item = r.item_code;
    const d = new Date(r.invoice_date);
    const key = `${d.getFullYear()}-${d.getMonth()+1}`;

    if(!map[item]){
      map[item] = {
        desc: item,
        total:0,
        meses:{}
      };
    }

    map[item].total += r.boxes;
    map[item].meses[key] = (map[item].meses[key] || 0) + r.boxes;
  });

  const arr = Object.entries(map)
    .map(([cod,v])=>({cod,...v}))
    .sort((a,b)=> b.total - a.total);

  // HEADER
  thead.innerHTML = "";
  const trh = document.createElement("tr");

  ["Código","Descripción","Total"].forEach(t=>{
    const th = document.createElement("th");
    th.innerText = t;
    trh.appendChild(th);
  });

  meses.forEach(m=>{
    const [y,mo] = m.split("-");
    const fecha = new Date(y,mo-1);
    const nombre = fecha.toLocaleString("es-AR",{month:"short",year:"numeric"});
    const th = document.createElement("th");
    th.innerText = nombre;
    trh.appendChild(th);
  });

  thead.appendChild(trh);

  // BODY
  tbody.innerHTML = "";

  arr.forEach(p=>{
    const tr = document.createElement("tr");

    const tdCod = document.createElement("td");
    tdCod.innerText = p.cod;
    tr.appendChild(tdCod);

    const tdDesc = document.createElement("td");
    tdDesc.innerText = p.desc;
    tdDesc.className = "desc";
    tr.appendChild(tdDesc);

    const tdTotal = document.createElement("td");
    tdTotal.innerText = p.total;
    tr.appendChild(tdTotal);

    meses.forEach(m=>{
      const td = document.createElement("td");
      td.innerText = p.meses[m] || "";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  statusBox.style.display = "none";
  tabla.style.display = "table";
}

// ================= INIT =================
async function init(){
  const session = await getSession();
  if(!session) return;

  const cliente = await getCliente(session);
  $("cliente").innerText = `Cliente: ${cliente.business_name} (${cliente.cod_cliente})`;

  const ventas = await getSales(cliente.cod_cliente);
  renderTabla(ventas);
}

init();
