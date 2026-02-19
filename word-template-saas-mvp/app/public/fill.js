function getId() {
  const u = new URL(location.href);
  return u.searchParams.get("id");
}
const id = getId();
if (!id) {
  alert("Falta id");
  location.href = "/templates.html";
}

async function apiJson(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function inputFor(v) {
  const row = document.createElement("div");
  row.className = "field";
  const label = document.createElement("label");
  label.textContent = v.label + " *";
  label.className = "label";
  row.appendChild(label);

  let input;
  if (v.type === "image") {
    input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
  } else if (v.type === "date") {
    input = document.createElement("input");
    input.type = "date";
  } else if (v.type === "number") {
    input = document.createElement("input");
    input.type = "number";
  } else if (v.type === "select") {
    input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Selección (MVP: texto)";
  } else {
    input = document.createElement("input");
    input.type = "text";
  }
  input.required = true;
  input.dataset.varId = v.id;
  input.dataset.varType = v.type;
  row.appendChild(input);

  return row;
}

async function loadVars() {
  const { variables } = await apiJson(`/api/templates/${id}/variables`);
  const wrap = document.getElementById("vars");
  wrap.innerHTML = "";

  if (!variables.length) {
    wrap.innerHTML = `<div class="empty-state"><p>No se encontraron variables en la plantilla. Inserta variables en el editor usando content controls.</p></div>`;
    return;
  }

  variables.forEach(v => wrap.appendChild(inputFor(v)));
}

function gather() {
  const vars = {};
  const files = [];
  const inputs = document.querySelectorAll("[data-var-id]");
  for (const el of inputs) {
    const varId = el.dataset.varId;
    const type = el.dataset.varType;

    if (type === "image") {
      if (!el.files || !el.files[0]) throw new Error(`Falta imagen: ${varId}`);
      files.push({ varId, file: el.files[0] });
    } else {
      const val = (el.value || "").trim();
      if (!val) throw new Error(`Falta valor: ${varId}`);
      vars[varId] = val;
    }
  }
  return { vars, files };
}

async function generate() {
  const { vars, files } = gather();
  const fd = new FormData();
  fd.append("vars", JSON.stringify(vars));
  for (const f of files) {
    fd.append(f.varId, f.file);
  }
  const r = await apiJson(`/api/templates/${id}/generate`, { method: "POST", body: fd });
  const box = document.getElementById("result");
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="success">
      <div>Documento generado:</div>
      <a class="btn btn-primary" href="${r.downloadUrl}">Descargar DOCX</a>
    </div>
  `;
}

document.getElementById("btnGenerate").addEventListener("click", () => {
  generate().catch(err => alert(err.message));
});

loadVars().catch(err => {
  console.error(err);
  alert("Error cargando variables: " + err.message);
});
