const config = window.ZUQUI_CARDAPIO_CONFIG || {};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const state = { categories: [], products: [], category: "", search: "" };
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

function render() {
  const availableCategories = state.categories.filter((item) => item.available !== false);
  byId("categories").innerHTML = `<button class="${state.category ? "" : "active"}" data-category="">Todos</button>${availableCategories.map((item) => `<button class="${state.category === item.id ? "active" : ""}" data-category="${escapeHtml(item.id)}">${escapeHtml(item.display_name || item.name)}</button>`).join("")}`;
  const needle = normalize(state.search);
  const products = state.products.filter((item) => item.available !== false && (!state.category || item.category_id === state.category) && (!needle || normalize(item.display_name || item.name).includes(needle)));
  byId("products").innerHTML = products.length ? products.map((item) => {
    const name = item.display_name || item.name;
    const image = item.image_url || item.additional_image_url || "";
    return `<article class="product">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">` : '<div class="placeholder" aria-hidden="true">Z</div>'}<div><p class="product-category">${escapeHtml(availableCategories.find((category) => category.id === item.category_id)?.display_name || availableCategories.find((category) => category.id === item.category_id)?.name || "Zuqui")}</p><h3>${escapeHtml(name)}</h3><p class="description">${escapeHtml(item.description || "Preparado com o cuidado e o sabor do Zuqui.")}</p><strong>${money.format(item.source_price ?? item.price ?? 0)}</strong></div></article>`;
  }).join("") : '<p class="empty">Nenhum produto encontrado nesta seleção.</p>';
}

byId("categories").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  render();
});
byId("search").addEventListener("input", (event) => { state.search = event.target.value; render(); });

(async () => {
  try {
    if (!config.apiUrl) throw new Error("Cardápio temporariamente indisponível.");
    const response = await fetch(config.apiUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "public_menu" }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível carregar o cardápio.");
    state.categories = result.categories || [];
    state.products = result.products || [];
    render();
  } catch (error) {
    byId("products").innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
})();
