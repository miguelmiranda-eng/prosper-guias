# Prosper Guías

Plataforma interna de Prosper Manufacturing para documentar procesos paso a paso. Una extensión de Chrome/Edge graba clics y campos con captura de pantalla. Con esa grabación se arma una guía que se puede editar, versionar y exportar a PDF.

## Arquitectura

| Capa | Tecnología | Por qué |
|---|---|---|
| App y API | Next.js 16 (App Router), desplegado en Vercel | Server Components para leer, Server Actions para escribir y un Route Handler para el PDF |
| Base de datos | Supabase Postgres | Los permisos viven en la base (RLS y funciones). Ninguna ruta usa la *service role key* |
| Autenticación | Supabase Auth (correo y contraseña, cookies vía `@supabase/ssr`) | El proxy refresca la sesión y la identidad se verifica con `getClaims()` |
| Archivos | Supabase Storage, bucket **privado** `guide-media` | Las imágenes viven en la ruta `<guide_id>/<uuid>.jpg` y sólo se ven con URL firmada de 1 hora. Las imágenes que no son PNG/JPG o pesan más de 5 MB se rechazan en el propio bucket |
| Grabación | Extensión MV3 (`extension/`), en JavaScript plano, sin compilar | Una página web no puede ver los clics hechos en otros sitios, por eso la grabación necesita una extensión |

```
src/
  proxy.ts                  sesión y redirección a /login (sólo es comodidad: la autoridad es RLS)
  lib/
    session.ts              requireSession / getWorkspaceContext (espacio activo validado contra las membresías)
    guides/queries.ts       lecturas: biblioteca paginada, guía con URLs firmadas, versiones
    guides/actions.ts       TODAS las mutaciones de guías y pasos (validadas con zod)
    team/actions.ts         espacio, miembros, perfil
    pdf/                    generación del PDF (pdf-lib) y utilidades de texto
    permissions.ts          espejo de la matriz de la base, SÓLO para decidir qué botones se muestran
  app/(app)/                inicio, biblioteca, papelera, editor, vista de lectura, equipo, extensión
  app/api/guides/[id]/pdf   GET → descarga application/pdf
  app/api/ext/config        GET → URL y llave pública de Supabase para la extensión
supabase/migrations/        esquema versionado
supabase/tests/rls.sql      pruebas de permisos (se ejecutan dentro de una transacción y terminan con ROLLBACK)
extension/                  grabador para Chrome/Edge
```

## Permisos

La autoridad es la base de datos: políticas RLS más las funciones `can_read_guide`, `can_edit_guide` y `can_manage_guide`. Cambiar un id en la URL o en una petición no da acceso a nada. Si la guía no se puede leer, la respuesta es 404, para no revelar que existe.

| Rol | Leer guías del equipo | Crear | Editar las suyas | Editar las del equipo | Visibilidad / papelera de las del equipo | Miembros |
|---|---|---|---|---|---|---|
| Propietario | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (incluye nombrar administradores) |
| Administrador | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (excepto sobre propietarios y administradores) |
| Editor | ✔ | ✔ | ✔ | ✔ | — | — |
| Colaborador | ✔ | ✔ | ✔ | — | — | — |
| Lector | ✔ | — | — | — | — | — |

- Una guía **privada** sólo la ve su autor, sin importar el rol.
- En la papelera no se edita. Sólo se restaura o se borra definitivamente, y el borrado definitivo elimina también las imágenes.
- El trigger `guides_before_update` separa *editar contenido* de *administrar*. Así, un editor no puede cambiar la visibilidad de la guía de otra persona ni mandarla a la papelera.

## Puesta en marcha

1. Crea un proyecto en Supabase y aplica `supabase/migrations/*.sql`, en orden, con el SQL editor o con `supabase db push`.
2. Corre `supabase/tests/rls.sql` en el SQL editor. Debe terminar con «RLS: todas las pruebas pasaron».
3. Copia `.env.example` a `.env.local` y llénalo con los datos de Project Settings → API.
4. En Supabase → Authentication → URL Configuration:
   - **Site URL**: la URL de Vercel.
   - **Redirect URLs**: la URL de Vercel con `/auth/callback` al final, y `http://localhost:3000/auth/callback`.
5. Instala y arranca:

   ```bash
   npm install
   ```

   ```bash
   npm run dev
   ```

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local |
| `npm run build` | Build de producción |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run icons` | Regenera los íconos de la extensión |

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: **Add New → Project →** importa el repo. Framework: Next.js; no hace falta configurar el build.
3. En Environment Variables, agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Pulsa Deploy. Luego actualiza la Site URL y las Redirect URLs en Supabase (paso 4 de arriba).

**Correo de confirmación:** el SMTP por defecto de Supabase sólo envía correos a miembros del equipo de la organización de Supabase y tiene un límite muy bajo. Para que cualquier empleado pueda registrarse hay que configurar un SMTP propio (por ejemplo Resend) en Authentication → SMTP.

## Extensión

Instalación (modo desarrollador):

1. Abre `chrome://extensions` (o `edge://extensions`).
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta `extension/`.

Para conectarla, pega la URL de la app en el popup e inicia sesión con tu cuenta. La extensión hace lo siguiente:

- Crea la guía como **privada y en borrador** al iniciar la grabación.
- Por cada clic, selección o campo, toma una captura de la pestaña visible y la sube en orden. Las capturas se toman como máximo 2 por segundo, que es el límite de Chrome.
- **Nunca registra lo que se escribe**, sólo el nombre del campo. En campos sensibles (contraseña, tarjeta, CURP/RFC, PIN, token…) el paso se guarda sin captura.
- Guarda la cola en `chrome.storage.local`. Si se va el internet o se cierra el navegador, la reintenta hasta subirla.
- Al terminar, pone título y descripción automáticos. Son reglas fijas, no IA. Después abre la guía.

**Límites:** sólo funciona en páginas http/https. No graba aplicaciones de escritorio, iframes de otro dominio, ni el texto de editores enriquecidos (`contenteditable`). La captura cubre sólo la parte visible de la pestaña.

## Estado por fases

| Fase | Estado |
|---|---|
| 2 · Modelo de datos, auth, permisos | ✔ |
| 3 · Navegación, biblioteca, inicio | ✔ (sin carpetas, etiquetas ni favoritos) |
| 4 · Captura y extensión | ✔ (navegador; escritorio fuera de alcance) |
| 5 · Editor, imágenes, versiones | ✔ (manuales pendientes) |
| 6 · Invitaciones por correo, tareas, comentarios | Pendiente. Hoy se agrega a usuarios ya registrados |
| 7 · Enlaces compartidos, HTML, estadísticas de visitas | Pendiente. El PDF ya funciona |
| 8 · IA | Pendiente. El proveedor todavía no está elegido |
