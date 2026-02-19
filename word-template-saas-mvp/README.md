# Word-Template SaaS MVP (ONLYOFFICE + Variables + DOCX Builder)

Este proyecto es un **MVP funcional** para lo que pediste:
- Pantalla de **Plantillas**
- Editor tipo Word **(ONLYOFFICE Docs embebido)**
- Variables como **chips** usando **Content Controls (tags)** dentro del DOCX
- Formulario de relleno automático
- Generación de **DOCX real** con **Document Builder API** (sin renombrar HTML)

## Requisitos
- Docker + Docker Compose

## Arranque
```bash
docker compose up --build
```

Luego abre:
- App: http://localhost:3000/templates.html
- ONLYOFFICE: http://localhost:8080 (solo para verificar, normalmente se usa embebido)

## Flujo
1) En **Plantillas** crea una nueva plantilla.
2) Ábrela en el editor (ONLYOFFICE).
3) Inserta variables usando el panel del plugin:
   - En el editor, ve a la pestaña **Plugins** → **Variables (MVP)**.
4) Cierra el editor y vuelve.
5) En Plantillas → **Abrir** para rellenar variables y generar un DOCX final.

## Notas importantes
- Este MVP guarda los DOCX en disco dentro del contenedor `app` (carpeta `app/data/...`).
- Para producción se reemplaza por:
  - Postgres (metadatos)
  - S3/MinIO (archivos)
  - JWT en ONLYOFFICE config
  - Cola de trabajos (BullMQ/Rabbit) para generación

## Estructura
- `docker-compose.yml` levanta:
  - `documentserver` (ONLYOFFICE)
  - `app` (Node/Express + HTML)
- `onlyoffice-plugins/variables` plugin MVP para insertar content controls como variables.
- `app/docbuilder/generate.docbuilder` script para rellenar variables y exportar DOCX.

