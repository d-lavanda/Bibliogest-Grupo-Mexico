# BiblioGest — Librería Itinerante, Grupo México (Unidad Santa Bárbara)

Sistema de préstamo de libros. Los datos (libros, usuarios, préstamos,
contraseña de admin) viven en **Firebase Firestore**, una base de datos real
en la nube — no en `localStorage` — así que cualquier cambio hecho desde una
computadora se ve reflejado al instante en todas las demás, sin recargar la
página.

## Archivos del proyecto

| Archivo               | Qué contiene |
|------------------------|--------------|
| `index.html`           | Estructura de la página (pantallas, formularios, modales) |
| `style.css`             | Todos los estilos visuales |
| `firebase-config.js`    | Claves de conexión a **tu** proyecto de Firebase (debes completarlo, paso 1) |
| `seed-data.js`          | Datos iniciales (libros de ejemplo, tu usuario y el admin) — solo se usan la primera vez |
| `app.js`                | Toda la lógica: login, catálogo, préstamos, panel admin, sincronización con Firestore |

Además necesitas subir tus dos imágenes de logo (`grupomexicologo.png` y
`grupomexicologo1.png`) a la misma carpeta — no se incluyen aquí porque no
las subiste en este chat.

---

## Paso 1 — Crear el proyecto en Firebase (gratis)

1. Ve a **https://console.firebase.google.com** e inicia sesión con una cuenta de Google.
2. "Crear un proyecto" → ponle un nombre, ej. `bibliogest-santabarbara`.
3. Puedes desactivar Google Analytics (no lo necesitas).
4. Dentro del proyecto, ve a **Compilación → Firestore Database → Crear base de datos**.
   - Elige **modo de producción**.
   - Elige la región más cercana (ej. `us-central1`).
5. Ve a **Compilación → Authentication → Comenzar** → pestaña "Sign-in method" → habilita **Anónimo**.
   (Esto es necesario para que las reglas de seguridad del paso 3 funcionen.)
6. Ve a **Configuración del proyecto** (ícono de engranaje, arriba a la izquierda) → baja hasta "Tus apps" → pulsa el ícono **`</>`** (Web) → dale un nombre (ej. "bibliogest-web") → **Registrar app**.
7. Firebase te mostrará un bloque `firebaseConfig = {...}`. Copia esos valores dentro de tu archivo `firebase-config.js`, reemplazando los que dicen `TU_...`.

## Paso 2 — Reglas de seguridad de Firestore (importante)

Por defecto, Firestore en "modo de producción" bloquea todo. Ve a
**Firestore Database → Reglas** y pega esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bibliogest/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Esto permite leer/escribir solo a quien haya iniciado sesión anónima (lo
cual hace la app automáticamente al abrirse). **Nota honesta:** esto no es
seguridad de nivel empresarial — cualquier persona con conocimientos
técnicos que abra las herramientas de desarrollador del navegador podría
llegar a leer el documento completo, incluyendo las CURP de los usuarios
registrados (algunos son menores de edad) y las contraseñas ya cifradas
(hash SHA-256, nunca en texto plano). Para un sistema en producción real que
maneje datos de menores, lo correcto a mediano plazo sería mover la validación
de login a un backend (por ejemplo, Firebase Cloud Functions) que nunca
exponga los datos crudos al navegador. Coméntalo con tu asesor de proyecto;
para un sistema de biblioteca comunitaria interno esto suele ser un riesgo
aceptable, pero es importante que lo sepas y lo decidas con conocimiento.

## Paso 3 — Probar en tu computadora

Solo abre `index.html` en el navegador con doble clic, o usa una extensión
tipo "Live Server" si tienes VSCode. La primera vez que cargue, va a crear el
documento en Firestore con los datos de `seed-data.js` (tus 8 libros, tu
usuario y el admin).

## Paso 4 — Subir a GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público).
2. Sube estos archivos: `index.html`, `style.css`, `firebase-config.js`,
   `seed-data.js`, `app.js`, y tus dos imágenes de logo.
3. Ve a **Settings → Pages** del repositorio → en "Source" elige la rama
   `main` y la carpeta `/ (root)` → **Save**.
4. En un par de minutos tu app estará en
   `https://TU-USUARIO.github.io/TU-REPOSITORIO/`.

Como ahora la base de datos vive en Firestore (no en el navegador de cada
persona), todos los que entren a esa URL —desde cualquier computadora,
celular, o lugar— van a compartir exactamente la misma información en
tiempo real.

## Usuario administrador

- **Usuario:** `admin`
- **Contraseña:** `GrupoMexico2024`

Puedes cambiarla desde el panel admin → pestaña "Configuración" una vez que
inicies sesión (el cambio también queda guardado en Firestore).

## Cuota gratuita de Firestore

El plan gratuito ("Spark") de Firebase incluye 50,000 lecturas y 20,000
escrituras al día, más que suficiente para el uso normal de una biblioteca
comunitaria — no necesitas tarjeta de crédito para este nivel.
