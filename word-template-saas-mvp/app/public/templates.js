async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmtDate(ms) {
  const d = new Date(ms);
  return d.toLocaleString();
}

function tplCard(tpl) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div class="card-title">${tpl.name}</div>
    <div class="card-meta">Actualizada: ${fmtDate(tpl.updatedAt)}</div>
    <div class="card-actions">
      <a class="btn" href="/editor.html?id=${tpl.id}">Editar</a>
      <a class="btn" href="/fill.html?id=${tpl.id}">Abrir</a>
      <button class="btn btn-danger" data-del="${tpl.id}">Eliminar</button>
    </div>
  `;
  return el;
}

async function load() {
  const list = await api("/api/templates");
  const empty = document.getElementById("empty");
  const grid = document.getElementById("list");
  grid.innerHTML = "";
  if (!list.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.forEach(t => grid.appendChild(tplCard(t)));
}

document.getElementById("btnNew").addEventListener("click", async () => {
  const name = prompt("Nombre de la plantilla:", "Nueva plantilla");
  if (!name) return;
  await api("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  await load();
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-del]");
  if (!btn) return;
  const id = btn.getAttribute("data-del");
  if (!confirm("¿Eliminar plantilla?")) return;
  await api(`/api/templates/${id}`, { method: "DELETE" });
  await load();
});

load();
