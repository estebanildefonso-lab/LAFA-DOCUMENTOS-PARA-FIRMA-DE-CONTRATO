# Despliegue en GitHub y Railway

Esta guia asume que el flujo activo usa Apps Script para Google Drive, sin Google Cloud.

## Antes de subir a GitHub

No subas secretos al repositorio.

Archivos seguros para GitHub:

- `.env.example`
- `apps-script/Code.gs` con placeholder en `SECRET`
- `railway.json`
- codigo de Next.js

Archivos que no deben subirse:

- `.env.local`
- `.env`
- `.next`
- `node_modules`

La app ya tiene `.gitignore` configurado para ignorarlos.

## Apps Script

El archivo `apps-script/Code.gs` del repo contiene:

```js
const SECRET = "PEGA_AQUI_EL_MISMO_SECRET_DE_RAILWAY";
```

En Google Apps Script debes reemplazarlo por el valor real, por ejemplo:

```js
const SECRET = "tu_secret_real";
```

Ese valor real debe coincidir con:

```env
GOOGLE_APPS_SCRIPT_SECRET=tu_secret_real
```

Cada vez que cambies `Code.gs`, crea una nueva version de la aplicacion web:

1. `Implementar`
2. `Administrar implementaciones`
3. Editar la aplicacion web
4. Version: `Nueva version`
5. `Implementar`

Verifica la URL `/exec` en el navegador. Debe responder con `ok: true` y la version del script.

## Variables de Railway

En Railway, agrega estas variables en el servicio de Next.js:

```env
OPENAI_API_KEY=sk-proj-tu_llave_real
OPENAI_MODEL=gpt-5-nano
DRIVE_PROVIDER=apps_script
GOOGLE_APPS_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/TU_ID/exec
GOOGLE_APPS_SCRIPT_SECRET=tu_secret_real
```

No agregues comillas alrededor de valores simples.

## Configuracion Railway

El proyecto ya incluye:

- `railway.json`
- `next.config.mjs` con `output: "standalone"`
- `package.json` con `start` usando `.next/standalone/server.js`

Railway debe ejecutar:

```bash
npm run build
npm run start
```

## Subir a GitHub

Desde la raiz del proyecto:

```bash
git init
git add .
git commit -m "Initial deployment-ready app"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## Conectar Railway a GitHub

1. Entra a Railway.
2. Crea un proyecto nuevo.
3. Elige `Deploy from GitHub repo`.
4. Selecciona el repo.
5. Agrega las variables de entorno.
6. Deploy.
7. En `Settings > Networking`, genera dominio publico.

## Fricciones conocidas

- Si `Drive: No autorizado`, el `SECRET` de Apps Script no coincide con `GOOGLE_APPS_SCRIPT_SECRET`.
- Si el CSV no actualiza formato nuevo, Apps Script no fue redeployado con una version nueva.
- Si OpenAI responde `insufficient_quota`, falta saldo/cuota/billing en OpenAI.
- Si cambias variables en Railway, redeploya el servicio.
- `npm run dev` local no usa el modo standalone; sigue funcionando igual.
