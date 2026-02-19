function getId() {
  const u = new URL(location.href);
  return u.searchParams.get("id");
}
const id = getId();
if (!id) {
  alert("Falta id");
  location.href = "/templates.html";
}

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function main() {
  const { docServerApiJs, config } = await api(`/api/templates/${id}/editor-config`);

  // Cargar api.js de ONLYOFFICE
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = docServerApiJs;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  // eslint-disable-next-line no-undef
  new DocsAPI.DocEditor("placeholder", config);
}

main().catch(err => {
  console.error(err);
  alert("No se pudo iniciar el editor: " + err.message);
});
