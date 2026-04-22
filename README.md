# DOCUMENTOS PARA CONTRATACIÓN

Aplicacion web mobile-first para capturar datos de un candidato, validar documentos con OpenAI y subir solo documentos aprobados a Google Drive. Tambien registra cada intento en un CSV de Google Drive.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- OpenAI API por ruta server-side
- Google Drive por Apps Script o por cuenta de servicio

## Flujo implementado

1. Bienvenida
2. Consentimiento
3. Datos personales: apellido paterno, apellido materno y nombre(s)
4. Carga paso a paso de documentos
5. Vista previa de PDF o imagen
6. Validacion de tipo y tamano
7. Validacion estructurada con OpenAI
8. Subida a Drive solo si el documento aprueba
9. Registro CSV en Drive con una fila por candidato
10. Resumen final con resultados por documento

## Documentos

- Acta de nacimiento
- INE
- CURP
- RFC
- NSS
- Comprobante de domicilio
- Estado de cuenta bancario

## Reglas de validacion usadas por OpenAI

- Acta: nombre coincide con datos personales.
- INE: identificacion oficial legible; el nombre detectado se usa como nombre oficial cuando coincide aunque este en otro orden.
- CURP: nombre coincide y documento legible.
- RFC: QR, regimen de sueldos y salarios, vigencia no mayor a 3 meses.
- NSS: debe ser comprobante oficial de asignacion/localizacion, hoja rosa o comprobante digital del IMSS; no cartilla, carnet, credencial, gafete ni tarjeta medica aunque muestre el NSS.
- Comprobante de domicilio: debe ser legible y parecer valido.
- Banco: debe mostrar cuenta o CLABE y parecer documento bancario.

## Instalacion local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

La app puede correr sin credenciales para probar el flujo visual. En ese caso la API respondera `requiere_revision`, no subira archivos a Drive y explicara que faltan variables de entorno.

## Variables de entorno

Copia el archivo de ejemplo:

```bash
cp .env.example .env.local
```

Configura:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini

DRIVE_PROVIDER=apps_script
GOOGLE_APPS_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
GOOGLE_APPS_SCRIPT_SECRET=tu_clave_secreta
```

### Google Drive sin Google Cloud

Este es el modo recomendado si no tienes cuenta de Google Cloud. El archivo
[apps-script/Code.gs](</Users/esteban/Documents/DOCUMENTOS PARA CONTRATO/apps-script/Code.gs>) ya trae estos folders configurados:

- Documentos aprobados: `1c-ZnEzPKntiSt8mOTwgXjs7k_US_LtCX`
- Log documentos contratacion: `1zW32uufou3i6BU2tb-RLJIZ2w0Ti7PeQ`

Pasos:

1. Entra a `https://script.google.com/`.
2. Crea un proyecto nuevo.
3. Copia el contenido de `apps-script/Code.gs` y pegalo en `Code.gs`.
4. Cambia `CAMBIA_ESTA_CLAVE_SECRETA` por una clave inventada por ti.
5. Guarda el proyecto.
6. Ve a `Implementar > Nueva implementacion`.
7. Selecciona tipo `Aplicacion web`.
8. En `Ejecutar como`, selecciona `Yo`.
9. En `Quien tiene acceso`, selecciona `Cualquier persona`.
10. Autoriza permisos de Drive.
11. Copia la URL terminada en `/exec`.
12. Pon esa URL en `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`.
13. Pon la misma clave secreta en `GOOGLE_APPS_SCRIPT_SECRET`.

Cada vez que cambies `apps-script/Code.gs`, vuelve a implementar la aplicacion web en Apps Script. Si solo guardas el archivo, la URL `/exec` puede seguir usando una version anterior.

Ejemplo:

```bash
DRIVE_PROVIDER=apps_script
GOOGLE_APPS_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbx.../exec
GOOGLE_APPS_SCRIPT_SECRET=la_misma_clave_del_apps_script
```

### Formato del CSV

El CSV usa una fila por `folio` de candidato. Si el candidato vuelve a validar un documento, la app actualiza esa misma fila en lugar de crear otra.

Columnas principales:

```text
folio
fecha_creacion
fecha_actualizacion
nombre_candidato
curp
```

Por cada documento agrega columnas como:

```text
estado AN, score AN, archivo AN, observaciones AN, motivos AN, subido_drive AN, link AN
estado INE, score INE, archivo INE, observaciones INE, motivos INE, subido_drive INE, link INE
estado CURP, score CURP, archivo CURP, observaciones CURP, motivos CURP, subido_drive CURP, link CURP
estado RFC, score RFC, archivo RFC, observaciones RFC, motivos RFC, subido_drive RFC, link RFC
estado NSS, score NSS, archivo NSS, observaciones NSS, motivos NSS, subido_drive NSS, link NSS
estado DOM, score DOM, archivo DOM, observaciones DOM, motivos DOM, subido_drive DOM, link DOM
estado BANCO, score BANCO, archivo BANCO, observaciones BANCO, motivos BANCO, subido_drive BANCO, link BANCO
```

Si ya existia un CSV con el formato anterior de una fila por documento, Apps Script crea una copia de respaldo y reescribe el archivo con el formato nuevo.

### Google Drive con Google Cloud

Este modo es opcional. Usalo solo si tienes cuenta de servicio:

```bash
DRIVE_PROVIDER=google_cloud
GOOGLE_CLIENT_EMAIL=cuenta-servicio@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_APPROVED_FOLDER_ID=...
GOOGLE_DRIVE_LOG_FOLDER_ID=...
```

Para Google Drive con cuenta de servicio:

1. Crea una cuenta de servicio en Google Cloud.
2. Habilita Google Drive API.
3. Copia el correo de la cuenta de servicio en `GOOGLE_CLIENT_EMAIL`.
4. Comparte la carpeta de aprobados y la carpeta del log con ese correo.
5. Usa el ID de cada carpeta en las variables correspondientes.

## JSON esperado de validacion

La ruta `/api/documents/validate-and-upload` pide a OpenAI un JSON con esta forma:

```json
{
  "tipo_documento": "RFC",
  "estado_validacion": "aprobado",
  "score_confianza": 0.92,
  "puede_continuar": true,
  "motivos": ["Documento legible", "Regimen detectado"],
  "nombre_detectado": "NOMBRE DEL CANDIDATO",
  "curp_detectada": "ABCD010203HDFRRS09",
  "observaciones": "Cumple con los criterios configurados."
}
```

## Railway

El repo incluye `railway.json`.

En Railway:

1. Crea un proyecto desde GitHub.
2. Agrega las variables de entorno del archivo `.env.example`.
3. Usa Node 20 o superior.
4. Railway ejecutara `npm run build` y despues `npm run start`.

Para pasos detallados de GitHub, Railway y Apps Script, revisa [DEPLOYMENT.md](</Users/esteban/Documents/DOCUMENTOS PARA CONTRATO/DEPLOYMENT.md>).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
```

## Notas de seguridad

- Las llaves de OpenAI y Google se usan solo en rutas server-side.
- Los archivos rechazados no se guardan en la carpeta final de aprobados.
- El log CSV registra una fila por candidato, actualiza las columnas del documento revalidado y conserva la CURP detectada cuando el documento la muestra claramente.
- El navegador guarda temporalmente datos y resultados en `localStorage` para continuar la captura.
