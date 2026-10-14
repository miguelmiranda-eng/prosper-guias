import { headers } from "next/headers";
import { CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CopyField } from "./copy-field";

export const metadata = { title: "Extensión" };

export default async function ExtensionPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const appUrl = `${proto}://${host}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Grabar con la extensión"
        subtitle="La extensión de Chrome/Edge registra tus clics y los campos que llenas, con captura de pantalla, y arma la guía sola."
      />

      <section className="card mb-6 p-5">
        <h2 className="mb-3 font-medium">1 · Instalar (modo desarrollador)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Descarga o copia la carpeta <code className="rounded bg-surface-2 px-1">extension/</code> del repositorio del proyecto.</li>
          <li>Abre <code className="rounded bg-surface-2 px-1">chrome://extensions</code> (o <code className="rounded bg-surface-2 px-1">edge://extensions</code>) y activa <b>Modo de desarrollador</b>.</li>
          <li>Pulsa <b>Cargar descomprimida</b> y elige esa carpeta. Fija el ícono en la barra.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">Publicarla en la Chrome Web Store (instalación con un clic) es un paso aparte que requiere cuenta de desarrollador.</p>
      </section>

      <section className="card mb-6 p-5">
        <h2 className="mb-3 font-medium">2 · Conectar</h2>
        <p className="mb-2 text-sm">Abre la extensión, pega esta dirección y entra con tu mismo correo y contraseña:</p>
        <CopyField value={appUrl} />
      </section>

      <section className="card mb-6 p-5">
        <h2 className="mb-3 font-medium">3 · Grabar</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Elige el espacio de trabajo y pulsa <b>Iniciar grabación</b>. El ícono muestra <b>REC</b>.</li>
          <li>Haz el proceso normalmente. Usa <b>Pausar</b> para lo que no deba quedar, y <b>Capturar pantalla</b> para agregar un paso a mano.</li>
          <li>Pulsa <b>Terminar</b>: se abre la guía (privada, en borrador) para que la revises, tapes datos sensibles y la publiques.</li>
        </ol>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-ok" />Qué sí se registra</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Clics en botones, enlaces, menús, casillas y opciones.</li>
            <li>En qué campo escribiste o qué opción elegiste en una lista.</li>
            <li>Envío de formularios con Enter.</li>
            <li>Captura de la pestaña visible en cada paso.</li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" />Privacidad</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Nunca se guarda lo que escribes, sólo el nombre del campo.</li>
            <li>Campos de contraseña, tarjeta, CURP/RFC, PIN, etc.: el paso se registra sin captura.</li>
            <li>Las capturas se guardan privadas; sólo se ven con sesión y permiso.</li>
            <li>La guía nace privada y en borrador.</li>
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-warn bg-warn-soft p-5">
        <h2 className="mb-2 flex items-center gap-2 font-medium text-warn"><TriangleAlert className="h-4 w-4" />Límites conocidos</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Sólo páginas web (http/https). No graba páginas internas del navegador ni la tienda de extensiones.</li>
          <li>Aplicaciones de escritorio (Excel, SAP GUI, etc.): <b>no se graban</b>. Usa pasos manuales con imagen.</li>
          <li>Campos editables enriquecidos (editores de texto tipo Gmail) no generan paso de &quot;escribe&quot;; agrégalo a mano.</li>
          <li>Contenido dentro de iframes de otro dominio no se detecta.</li>
          <li>La captura es de la parte visible de la pestaña, no de la página completa.</li>
        </ul>
      </section>
    </div>
  );
}
