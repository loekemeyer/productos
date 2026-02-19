document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnMayorista");
  if (!btn) return;

  // Ir directo a la tienda (sin pantalla "en desarrollo")
  btn.addEventListener("click", () => {
    window.location.href = "mayorista.html";
  });
});
