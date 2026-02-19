\
import express from "express";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import multer from "multer";
import { nanoid } from "nanoid";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "http://localhost:3000";
const INTERNAL_APP_URL = process.env.INTERNAL_APP_URL || PUBLIC_APP_URL; // usado por ONLYOFFICE (contenedor) para acceder a la app
const DOCSERVER_PUBLIC_URL = process.env.DOCSERVER_PUBLIC_URL || "http://localhost:8080";
const DOCSERVER_INTERNAL_URL = process.env.DOCSERVER_INTERNAL_URL || DOCSERVER_PUBLIC_URL;

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const DATA_DIR = path.join(__dirname, "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const GENERATED_DIR = path.join(DATA_DIR, "generated");
const TEMPLATES_DB = path.join(DATA_DIR, "templates.json");
const BLANK_DOCX = path.join(__dirname, "templates", "blank.docx");

fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(GENERATED_DIR, { recursive: true });
if (!fs.existsSync(TEMPLATES_DB)) fs.writeFileSync(TEMPLATES_DB, JSON.stringify([]), "utf-8");

const upload = multer({ dest: path.join(DATA_DIR, "uploads") });

// Static
app.use(express.static(path.join(__dirname, "public")));
app.use("/docbuilder", express.static(path.join(__dirname, "docbuilder")));

// Helpers
function loadTemplates() {
  return JSON.parse(fs.readFileSync(TEMPLATES_DB, "utf-8"));
}
function saveTemplates(list) {
  fs.writeFileSync(TEMPLATES_DB, JSON.stringify(list, null, 2), "utf-8");
}
function getTemplateOr404(id, res) {
  const list = loadTemplates();
  const tpl = list.find(t => t.id === id);
  if (!tpl) {
    res.status(404).json({ error: "Template not found" });
    return null;
  }
  return tpl;
}

// --- Templates CRUD ---
app.get("/api/templates", (req, res) => {
  res.json(loadTemplates().sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0)));
});

app.post("/api/templates", (req, res) => {
  const list = loadTemplates();
  const id = nanoid(10);
  const now = Date.now();
  const name = (req.body?.name || `Plantilla ${id}`).toString();

  const filePath = path.join(FILES_DIR, `${id}.docx`);
  fs.copyFileSync(BLANK_DOCX, filePath);

  const tpl = { id, name, updatedAt: now };
  list.push(tpl);
  saveTemplates(list);

  res.json(tpl);
});

app.delete("/api/templates/:id", (req, res) => {
  const id = req.params.id;
  const list = loadTemplates();
  const next = list.filter(t => t.id !== id);
  if (next.length === list.length) return res.status(404).json({ error: "Not found" });

  const filePath = path.join(FILES_DIR, `${id}.docx`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  saveTemplates(next);
  res.json({ ok: true });
});

// --- Serve template DOCX to ONLYOFFICE ---
app.get("/api/templates/:id/file", (req, res) => {
  const id = req.params.id;
  const filePath = path.join(FILES_DIR, `${id}.docx`);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.sendFile(filePath);
});

// --- ONLYOFFICE editor config ---
app.get("/api/templates/:id/editor-config", (req, res) => {
  const id = req.params.id;
  const tpl = getTemplateOr404(id, res);
  if (!tpl) return;

  const fileUrl = `${INTERNAL_APP_URL}/api/templates/${id}/file`;
  const callbackUrl = `${INTERNAL_APP_URL}/api/onlyoffice/callback/${id}`;
  const key = `${id}-${tpl.updatedAt}`;

  const config = {
    documentType: "word",
    document: {
      fileType: "docx",
      title: `${tpl.name}.docx`,
      url: fileUrl,
      key
    },
    editorConfig: {
      mode: "edit",
      callbackUrl,
      customization: {
        forcesave: true
      }
    }
  };

  res.json({
    docServerApiJs: `${DOCSERVER_PUBLIC_URL}/web-apps/apps/api/documents/api.js`,
    config
  });
});

// --- ONLYOFFICE callback handler (save) ---
app.post("/api/onlyoffice/callback/:id", async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  // status: 2 - MustSave, 6 - MustForceSave (según la doc)
  // La doc indica que el callbackUrl se usa basado en status y que el storage debe descargar el archivo por URL.
  // (Ver docs ONLYOFFICE "Saving file".)
  const status = body.status;
  const url = body.url;

  if ((status === 2 || status === 6) && url) {
    const filePath = path.join(FILES_DIR, `${id}.docx`);
    const r = await fetch(url);
    if (!r.ok) {
      console.error("Failed to download from ONLYOFFICE", r.status, await r.text());
      return res.json({ error: 1 });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(filePath, buf);

    const list = loadTemplates();
    const tpl = list.find(t => t.id === id);
    if (tpl) tpl.updatedAt = Date.now();
    saveTemplates(list);
  }

  // Respuesta estándar
  res.json({ error: 0 });
});

// --- Extract variables by scanning content controls in DOCX (tags + alias) ---
app.get("/api/templates/:id/variables", (req, res) => {
  const id = req.params.id;
  const filePath = path.join(FILES_DIR, `${id}.docx`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });

  const zip = new AdmZip(filePath);
  const entries = zip.getEntries()
    .filter(e => e.entryName.startsWith("word/") && (e.entryName.endsWith(".xml")) && (e.entryName.includes("document") || e.entryName.includes("header") || e.entryName.includes("footer")));

  const varsMap = new Map();

  for (const e of entries) {
    const xml = zip.readAsText(e);
    const sdtPrBlocks = xml.match(/<w:sdtPr[\s\S]*?<\/w:sdtPr>/g) || [];
    for (const pr of sdtPrBlocks) {
      const tagMatch = pr.match(/<w:tag[^>]*w:val="([^"]+)"/);
      if (!tagMatch) continue;
      const tag = tagMatch[1];

      // Convención MVP: prefijo tipo: "txt:", "num:", "date:", "sel:", "img:"
      const [typePrefix, name] = tag.includes(":") ? tag.split(":", 2) : ["txt", tag];

      const aliasMatch = pr.match(/<w:alias[^>]*w:val="([^"]+)"/);
      const label = aliasMatch ? aliasMatch[1] : name;

      const type = ({
        "txt": "text",
        "num": "number",
        "date": "date",
        "sel": "select",
        "img": "image"
      })[typePrefix] || "text";

      const key = `${typePrefix}:${name}`;
      if (!varsMap.has(key)) {
        varsMap.set(key, { id: name, tag, type, label, required: true });
      }
    }
  }

  res.json({ variables: Array.from(varsMap.values()) });
});

// --- Generate final DOCX using Document Builder API ---
app.post("/api/templates/:id/generate", upload.any(), async (req, res) => {
  const id = req.params.id;
  const filePath = path.join(FILES_DIR, `${id}.docx`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Template not found" });

  // Variables vienen como fields JSON en req.body.vars
  // y archivos en req.files (para imágenes).
  let vars = {};
  try {
    vars = JSON.parse(req.body.vars || "{}");
  } catch (e) {}

  // Subimos imágenes: se envían como files con fieldname == variableId
  const files = req.files || [];
  for (const f of files) {
    // Guardamos con extensión .png/.jpg si existe
    const ext = (f.originalname.split(".").pop() || "bin").toLowerCase();
    const newName = `${nanoid(12)}.${ext}`;
    const dest = path.join(DATA_DIR, "uploads", newName);
    fs.renameSync(f.path, dest);

    // URL accesible para documentserver
    vars[f.fieldname] = `${INTERNAL_APP_URL}/uploads/${newName}`;
  }

  // Servir uploads
  app.use("/uploads", express.static(path.join(DATA_DIR, "uploads")));

  const outId = nanoid(12);
  const outName = `generated-${outId}.docx`;
  const outLocalPath = path.join(GENERATED_DIR, outName);

  // Llamada a Document Builder API (en documentserver)
  const docbuilderUrl = `${DOCSERVER_INTERNAL_URL}/docbuilder`;
  const scriptUrl = `${INTERNAL_APP_URL}/docbuilder/generate.docbuilder`;
  const templateUrl = `${INTERNAL_APP_URL}/api/templates/${id}/file`;

  const payload = {
    async: false,
    url: scriptUrl,
    argument: {
      templateUrl,
      outName,
      vars
    }
  };

  const r = await fetch(docbuilderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const text = await r.text();
    console.error("docbuilder error", r.status, text);
    return res.status(500).json({ error: "docbuilder request failed", details: text });
  }

  const result = await r.json();

  // Document Builder API devuelve `urls` para descargar el archivo generado.
  // Descargamos y lo guardamos localmente para servirlo desde nuestra app.
  const urlToDownload = (result && result.urls && result.urls[0]) ? result.urls[0] : null;
  if (!urlToDownload) {
    return res.status(500).json({ error: "No output urls from docbuilder", result });
  }

  const dl = await fetch(urlToDownload);
  if (!dl.ok) {
    return res.status(500).json({ error: "Failed to download generated docx", status: dl.status });
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  fs.writeFileSync(outLocalPath, buf);

  res.json({
    ok: true,
    downloadUrl: `${PUBLIC_APP_URL}/api/generated/${outName}`
  });
});

// Serve generated docs
app.get("/api/generated/:file", (req, res) => {
  const fp = path.join(GENERATED_DIR, req.params.file);
  if (!fs.existsSync(fp)) return res.status(404).end();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.sendFile(fp);
});

app.listen(PORT, () => {
  console.log(`App running on ${PUBLIC_APP_URL}`);
});
