# Frontend (guía de UI / UX)

Esta guía resume cambios de UX/UI realizados en el frontend para operación en planta, con foco en móviles.

---

## Scanner móvil (Depósitos → Registro)

En móvil (<= 720px), la vista de escaneo se optimiza para que el operario tenga una experiencia tipo “scanner”:

- Marco de escaneo con esquinas + línea animada.
- Botón flotante de linterna (si el dispositivo lo soporta).
- Acciones principales visibles sin depender del scroll (sheet inferior para el formulario).
- Feedback visual en cámara:
  - **Check verde** cuando el QR se detecta/acepta.
  - **Cruz roja** cuando falla el escaneo o hay error.
- El frame se fuerza a **aspect ratio 1:1** (cuadrado) para una zona de lectura más consistente.

---

## Topbar en móvil (simple)

Para reducir ruido visual y ganar espacio vertical en celular:

- La topbar en móvil muestra solo:
  - Botón **hamburguesa** (sidebar)
  - Botón **perfil**
- Mensajes, cambio de tema y “actualizar” quedan en el **sidebar**.

---

## Navegación por módulo (auto-redirect)

Si un usuario entra a un módulo y solo tiene acceso a **una** acción/vista dentro de ese módulo, se redirige automáticamente a esa vista.

Esto reduce clicks y evita páginas “vacías” para roles restringidos.

---

## Búsqueda global

Se eliminó la barra de búsqueda “Búsqueda en el sistema” del topbar de la plataforma para simplificar el header.

---

## PWA (instalación sin barra de navegador)

La configuración de PWA/HTTPS en LAN se documenta en:

- `deploy/GUIA_LAN_HTTPS_PWA.md`

