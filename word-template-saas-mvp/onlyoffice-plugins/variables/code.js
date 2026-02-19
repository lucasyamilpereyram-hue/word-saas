/* global window, Asc */

(function () {
  // Plugin entry
  window.Asc.plugin.init = function () {
    // UI bindings
    const typeEl = document.getElementById("type");
    const optionsWrap = document.getElementById("optionsWrap");

    typeEl.addEventListener("change", () => {
      optionsWrap.classList.toggle("hidden", typeEl.value !== "sel");
    });

    document.getElementById("insert").addEventListener("click", insertVar);
    document.getElementById("refresh").addEventListener("click", refreshList);
  };

  window.Asc.plugin.button = function () {
    this.executeCommand("close", "");
  };

  function rgba(r,g,b,a=255) {
    return { "R": r, "G": g, "B": b, "A": a };
  }

  async function tagExists(tag) {
    return new Promise((resolve) => {
      window.Asc.plugin.executeMethod("GetAllContentControls", null, (controls) => {
        const found = (controls || []).some(c => c.Tag === tag);
        resolve(found);
      });
    });
  }

  async function insertVar() {
    const name = (document.getElementById("name").value || "").trim();
    const label = (document.getElementById("label").value || "").trim();
    const type = document.getElementById("type").value;

    if (!name) return alert("Nombre requerido");
    const tag = `${type}:${name}`;
    const alias = label || name;

    if (await tagExists(tag)) return alert("Ya existe una variable con ese nombre/tag en el documento");

    // Chip look: sin bounding box + sombreado suave
    const commonPr = {
      "Id": Math.floor(Math.random() * 1000000),
      "Tag": tag,
      "Alias": alias,
      "Appearance": 2,
      // Lock: 2 (contenido bloqueado) en muchos casos permite borrar el control,
      // si tu versión lo interpreta distinto, ajusta a 0/1/2/3 según tus reglas.
      "Lock": 2,
      "Shd": { "Color": rgba(59, 130, 246, 80) } // azul translúcido
    };

    if (type === "img") {
      window.Asc.plugin.executeMethod("AddContentControlPicture", [commonPr]);
      return;
    }

    if (type === "date") {
      window.Asc.plugin.executeMethod("AddContentControlDatePicker", [
        { "DateFormat": "YYYY-MM-DD", "Date": new window.Date() },
        commonPr
      ]);
      return;
    }

    if (type === "sel") {
      const raw = (document.getElementById("options").value || "").trim();
      const options = raw ? raw.split(/\r?\n/).filter(Boolean) : ["Opción 1", "Opción 2"];
      const list = options.map(o => ({ "Display": o, "Value": o }));
      // type: 0 dropdown list, 1 combo box
      window.Asc.plugin.executeMethod("AddContentControlList", [0, list, commonPr]);
      return;
    }

    // txt/num -> inline content control (2)
    window.Asc.plugin.executeMethod("AddContentControl", [2, commonPr]);
  }

  function refreshList() {
    const list = document.getElementById("list");
    list.innerHTML = "";
    window.Asc.plugin.executeMethod("GetAllContentControls", null, (controls) => {
      (controls || []).forEach(c => {
        const div = document.createElement("div");
        div.className = "var";
        div.innerHTML = `<b>${c.Tag}</b><br><span>InternalId: ${c.InternalId}</span>`;
        list.appendChild(div);
      });
      if (!controls || !controls.length) {
        list.innerHTML = "<div class='note'>No hay variables/content controls en el documento.</div>";
      }
    });
  }
})();
