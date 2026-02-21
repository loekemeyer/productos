'use strict';

/***********************
 * SUPABASE CONFIG (igual que tu script.js)
 ***********************/
const SUPABASE_URL = 'https://kwkclwhmoygunqmlegrg.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3a2Nsd2htb3lndW5xbWxlZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjA2NzUsImV4cCI6MjA4NTA5NjY3NX0.soqPY5hfA3RkAJ9jmIms8UtEGUc4WpZztpEbmDijOgU';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function $(id) { return document.getElementById(id); }

function formatMoney(n) {
  return Math.round(Number(n || 0)).toLocaleString('es-AR');
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString('es-AR');
  } catch {
    return String(d || '');
  }
}

function showError(msg) {
  const e = $('histError');
  const s = $('histStatus');
  if (s) s.style.display = 'none';
  if (e) {
    e.style.display = 'block';
    e.textContent = msg || 'Error';
  }
}

function setStatus(msg) {
  const s = $('histStatus');
  if (!s) return;
  s.style.display = 'block';
  s.textContent = msg || '';
}

function showTable(show) {
  const w = $('histTableWrap');
  if (w) w.style.display = show ? 'block' : 'none';
}

function volverMayorista() {
  // vuelve al módulo mayorista (misma carpeta)
  window.location.href = './mayorista.html';
}
window.volverMayorista = volverMayorista;

async function requireLogin() {
  const { data } = await supabaseClient.auth.getSession();
  const session = data?.session || null;

  if (!session) {
    // No logueado => no mostramos nada
    showTable(false);
    showError('Tenés que iniciar sesión para ver el historial.');
    // opcional: volver automático
    // setTimeout(() => volverMayorista(), 800);
    return null;
  }
  return session;
}

async function loadCustomerProfileByAuth(authUserId) {
  const { data, error } = await supabaseClient
    .from('customers')
    .select('id,business_name,cod_cliente')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('No se encontró el perfil del cliente.');
  return data;
}

async function loadOrders(customerId) {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('id, created_at, total')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadItemsByOrderIds(orderIds) {
  if (!orderIds.length) return [];

  const { data, error } = await supabaseClient
    .from('order_items')
    .select('order_id, cajas, uxb')
    .in('order_id', orderIds);

  if (error) throw error;
  return data || [];
}

function render(orders, items) {
  const tbody = $('histTbody');
  if (!tbody) return;

  const itemsByOrder = new Map();
  for (const it of (items || [])) {
    const k = String(it.order_id);
    if (!itemsByOrder.has(k)) itemsByOrder.set(k, []);
    itemsByOrder.get(k).push(it);
  }

  if (!orders.length) {
    setStatus('No hay compras registradas.');
    showTable(false);
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const oid = String(o.id);
    const its = itemsByOrder.get(oid) || [];

    const cantItems = its.length;
    const cantCajas = its.reduce((acc, r) => acc + Number(r.cajas || 0), 0);

    return `
      <tr>
        <td>${formatDate(o.created_at)}</td>
        <td>${oid}</td>
        <td><strong>$ ${formatMoney(o.total)} + IVA</strong></td>
        <td>${cantItems} items · ${formatMoney(cantCajas)} cajas</td>
      </tr>
    `;
  }).join('');

  setStatus('');
  showTable(true);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    setStatus('Cargando…');

    const session = await requireLogin();
    if (!session) return;

    const profile = await loadCustomerProfileByAuth(session.user.id);

    const line = $('histClientLine');
    if (line) {
      const name = String(profile.business_name || '').trim();
      const cod = String(profile.cod_cliente || '').trim();
      line.textContent = `Cliente: ${name || '—'}${cod ? ` (Cod ${cod})` : ''}`;
    }

    const orders = await loadOrders(profile.id);
    const orderIds = orders.map(o => o.id);

    const items = await loadItemsByOrderIds(orderIds);

    render(orders, items);
  } catch (err) {
    console.error(err);
    showTable(false);
    showError('Error al cargar el historial. Revisá RLS/permiso en orders y order_items.');
  }
});
