// ══════════════════════════════════════════════════════════════════════════════
//  BiblioGest — Lógica de la aplicación
//  Librería Itinerante · Grupo México, Unidad Santa Bárbara
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
//  BASE DE DATOS COMPARTIDA (Firebase Firestore)
//  Todo el documento de la app vive en un solo documento de Firestore:
//  colección "bibliogest" → documento "data".
//  Cualquier computadora que abra esta página lee y escribe ESE MISMO
//  documento, así que un préstamo registrado en una computadora aparece
//  automáticamente (en tiempo real, sin recargar) en las demás.
// ══════════════════════════════════════════════════════════════════════════════
const DB_REF = db.collection('bibliogest').doc('data');

let DB = null;               // se llena cuando llega la primera respuesta de Firestore
let dbListo = false;
let usuarioActual = null;
let libroSeleccionado = null;
let diasPrestamo = 7;
let filtroGeneroActual = 'todos';
let guardando = false;       // evita choques cuando escribimos y Firestore nos responde a nosotros mismos

const GENEROS_DEFECTO = ['Novela','Clásico','Infantil','Fantasía','Misterio','Educativo','Historia','Ciencia ficción','Otro'];

function estructuraVacia() {
  return {
    libros: SEED.libros.map(l => ({ ...l, total: 1 })),
    usuarios: SEED.usuarios.map(u => ({ ...u })),
    admins: SEED.admins.map(a => ({ ...a })),
    prestamos: [],
    revision: [],
    generos: [...GENEROS_DEFECTO],
    _nextLibroId: SEED.libros.length + 1,
    _nextUsuarioId: SEED.usuarios.length + 1,
    _nextPrestamoId: 1,
    _nextRevisionId: 1
  };
}

// Añade campos nuevos a bases de datos creadas con versiones anteriores de la
// app, sin borrar nada de lo que ya existe en Firestore.
function migrarEstructura() {
  if (!DB.revision) DB.revision = [];
  if (!DB._nextRevisionId) DB._nextRevisionId = 1;

  // Existencias: los libros antiguos no tenían "total", se asume 1 ejemplar.
  DB.libros.forEach(l => {
    if (typeof l.total !== 'number' || l.total < 1) l.total = 1;
  });

  // Catálogo de géneros: se construye a partir de los que ya usan los libros.
  if (!Array.isArray(DB.generos) || !DB.generos.length) {
    const usados = DB.libros.map(l => l.genero).filter(Boolean);
    DB.generos = [...new Set([...GENEROS_DEFECTO, ...usados])];
  }
}

// Arranca la app: primero se autentica de forma anónima (requerido por las
// reglas de seguridad de Firestore, ver README.md), y luego escucha el
// documento en tiempo real.
async function iniciarBaseDeDatos() {
  try {
    await firebase.auth().signInAnonymously();
  } catch (e) {
    mostrarErrorConexion(e);
    return;
  }
  DB_REF.onSnapshot(async (snap) => {
    if (!snap.exists) {
      // Primera vez que se usa la app: crea el documento con el SEED.
      const inicial = estructuraVacia();
      try {
        await DB_REF.set(inicial);
      } catch (e) {
        mostrarErrorConexion(e);
      }
      return; // el propio set() disparará este mismo listener de nuevo
    }
    DB = snap.data();
    migrarEstructura();

    if (!dbListo) {
      dbListo = true;
      ocultarCargando();
      mostrarPantalla('login');
    } else {
      sincronizarSesionActiva();
      refrescarVistaActual();
    }
  }, (error) => {
    mostrarErrorConexion(error);
  });
}

// Reemplaza a la antigua guardarDB() de localStorage.
// Se llama exactamente igual en todo el resto del código: guardarDB();
async function guardarDB() {
  if (!DB) return;
  guardando = true;
  try {
    await DB_REF.set(DB);
  } catch (e) {
    mostrarErrorConexion(e);
  } finally {
    guardando = false;
  }
}

function mostrarErrorConexion(e) {
  console.error('Error de Firestore:', e);
  toast('No se pudo conectar a la base de datos. Revisa tu internet o la configuración de Firebase.', 'error');
}

function ocultarCargando() {
  const el = document.getElementById('pantalla-cargando');
  if (el) el.remove();
}

// Cuando llega un cambio desde otro dispositivo, DB se reemplaza completo.
// Esto vuelve a enganchar la sesión activa con el objeto nuevo, y cierra la
// sesión si el administrador desactivó o eliminó a ese usuario.
function sincronizarSesionActiva() {
  if (!usuarioActual) return;
  const fresco = DB.usuarios.find(u => u.id === usuarioActual.id);
  if (!fresco) {
    usuarioActual = null;
    limpiarCamposSensibles();
    mostrarPantalla('login');
    toast('Tu cuenta ya no está registrada. Sesión cerrada.', 'error');
    return;
  }
  if (!fresco.activo) {
    usuarioActual = null;
    limpiarCamposSensibles();
    mostrarPantalla('login');
    toast('Tu cuenta fue desactivada. Contacta al encargado.', 'error');
    return;
  }
  usuarioActual = fresco;
  const nom = document.getElementById('nombre-usuario');
  const av  = document.getElementById('avatar-usuario');
  if (nom) nom.textContent = fresco.nombre;
  if (av)  av.textContent  = fresco.nombre.charAt(0).toUpperCase();
}

// Vuelve a dibujar lo que sea que esté visible en pantalla cuando llegan
// cambios desde otro dispositivo.
function refrescarVistaActual() {
  if (document.getElementById('pantalla-usuario')?.classList.contains('activa')) {
    if (document.getElementById('tab-catalogo')?.classList.contains('activo')) renderCatalogo();
    else if (document.getElementById('tab-prestamos')?.classList.contains('activo')) renderMisPrestamos();
    else if (document.getElementById('tab-historial')?.classList.contains('activo')) renderHistorial();
  } else if (document.getElementById('pantalla-admin')?.classList.contains('activa')) {
    if (document.getElementById('tab-dashboard')?.classList.contains('activo')) renderDashboard();
    else if (document.getElementById('tab-prestamos-admin')?.classList.contains('activo')) renderTablaPrestamoAdmin();
    else if (document.getElementById('tab-revision')?.classList.contains('activo')) renderRevision();
    else if (document.getElementById('tab-inventario')?.classList.contains('activo')) renderInventario();
    else if (document.getElementById('tab-usuarios-admin')?.classList.contains('activo')) renderUsuariosAdmin();
  }
}

//  UTILIDADES
// ══════════════════════════════════════════════════════════════════════════════
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function toast(msg, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function mostrarPantalla(nombre) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById('pantalla-' + nombre).classList.add('activa');
}

function abrirModal(id) { document.getElementById(id).classList.add('activo'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('activo'); }

function fechaLocal(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().split('T')[0] + ' ' + d.toTimeString().slice(0,8);
}

function formatFecha(s) {
  if (!s) return '—';
  return s.slice(0,10);
}

function diasRestantes(fechaLimite) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const lim = new Date(fechaLimite); lim.setHours(0,0,0,0);
  return Math.ceil((lim - hoy) / 86400000);
}

function estadoBadge(estado, fechaLimite, fechaDev) {
  if (fechaDev) return '<span class="badge badge-verde">✓ Devuelto</span>';
  const d = diasRestantes(fechaLimite);
  if (d < 0) return '<span class="badge badge-rojo">⚠ Vencido</span>';
  if (d <= 3) return '<span class="badge badge-amarillo">⏰ Por vencer</span>';
  return '<span class="badge badge-verde">● Activo</span>';
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXISTENCIAS (ejemplares por título)
//  total = disponibles + prestados activos + en revisión
//  Los disponibles se CALCULAN, no se guardan, para que nunca se
//  desincronicen aunque dos personas presten al mismo tiempo.
// ══════════════════════════════════════════════════════════════════════════════
function copiasTotales(libro)    { return (typeof libro.total === 'number' && libro.total > 0) ? libro.total : 1; }
function copiasPrestadas(libro)  { return DB.prestamos.filter(p => p.libro_id === libro.id && !p.fecha_devolucion).length; }
function copiasEnRevision(libro) { return DB.revision.filter(r => r.libro_id === libro.id).length; }
function copiasDisponibles(libro) {
  return Math.max(0, copiasTotales(libro) - copiasPrestadas(libro) - copiasEnRevision(libro));
}

// ══════════════════════════════════════════════════════════════════════════════
//  CATÁLOGO DE GÉNEROS
// ══════════════════════════════════════════════════════════════════════════════
function listaGeneros() {
  return Array.isArray(DB?.generos) && DB.generos.length ? DB.generos : [...GENEROS_DEFECTO];
}

// Llena cualquier <select> de género con el catálogo actual.
function poblarSelectGeneros(selectId, valorSeleccionado) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const generos = listaGeneros();
  sel.innerHTML = generos.map(g => '<option value="' + escapeHtml(g) + '">' + escapeHtml(g) + '</option>').join('');
  if (valorSeleccionado && !generos.includes(valorSeleccionado)) {
    // El libro tiene un género que ya no está en el catálogo: se muestra igual.
    sel.innerHTML += '<option value="' + escapeHtml(valorSeleccionado) + '">' + escapeHtml(valorSeleccionado) + '</option>';
  }
  if (valorSeleccionado) sel.value = valorSeleccionado;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function generoBg(genero) {
  const p = {'Novela':'#FDE8D8','Clásico':'#E8E0F5','Infantil':'#D8F0E8','Fantasía':'#D8E8F5','Misterio':'#F5D8D8','Educativo':'#E8F5D8','Historia':'#F5EED8','default':'#EEE'};
  return p[genero] || p.default;
}

function generoEmoji(genero) {
  const e = {'Novela':'📗','Clásico':'📜','Infantil':'🧸','Fantasía':'🔮','Misterio':'🕵️','Educativo':'🎓','Historia':'🏛️','default':'📘'};
  return e[genero] || e.default;
}

function generoCssFilter(genero) {
  const f = {
    'Novela':     'invert(35%) sepia(60%) saturate(600%) hue-rotate(355deg) brightness(65%)',
    'Clásico':    'invert(25%) sepia(30%) saturate(500%) hue-rotate(250deg) brightness(65%)',
    'Infantil':   'invert(30%) sepia(50%) saturate(500%) hue-rotate(130deg) brightness(60%)',
    'Fantasía':   'invert(25%) sepia(40%) saturate(500%) hue-rotate(200deg) brightness(60%)',
    'Misterio':   'invert(20%) sepia(50%) saturate(600%) hue-rotate(340deg) brightness(60%)',
    'Educativo':  'invert(30%) sepia(50%) saturate(500%) hue-rotate(90deg) brightness(60%)',
    'Historia':   'invert(35%) sepia(50%) saturate(500%) hue-rotate(30deg) brightness(60%)',
    'default':    'invert(25%) sepia(20%) saturate(300%) brightness(55%)'
  };
  return f[genero] || f.default;
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════════════════
async function hacerLogin() {
  const curp = document.getElementById('login-curp').value.trim().toUpperCase();
  const pass = document.getElementById('login-pass').value;
  if (!curp || !pass) { toast('Completa todos los campos', 'error'); return; }
  const hash = await sha256(pass);
  const usuario = DB.usuarios.find(u => u.curp === curp && u.password === hash && u.activo);
  if (!usuario) { toast('CURP o contraseña incorrectos', 'error'); return; }
  usuarioActual = usuario;
  iniciarSesionUsuario();
}

function iniciarSesionUsuario() {
  document.getElementById('nombre-usuario').textContent = usuarioActual.nombre;
  document.getElementById('avatar-usuario').textContent = usuarioActual.nombre.charAt(0).toUpperCase();
  mostrarPantalla('usuario');
  cambiarTab('catalogo');
  toast('Bienvenido, ' + usuarioActual.nombre + ' 👋', 'exito');
}

async function hacerRegistro() {
  const nombre    = document.getElementById('reg-nombre').value.trim();
  const apellidos = document.getElementById('reg-apellidos').value.trim();
  const curp      = document.getElementById('reg-curp').value.trim().toUpperCase();
  const tel       = document.getElementById('reg-telefono').value.trim();
  const pass      = document.getElementById('reg-pass').value;
  const pass2     = document.getElementById('reg-pass2').value;
  const menor     = document.getElementById('reg-menor').checked;
  if (!nombre||!apellidos||!curp||!pass) { toast('Completa los campos obligatorios', 'error'); return; }
  if (curp.length !== 18) { toast('La CURP debe tener 18 caracteres', 'error'); return; }
  if (pass.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
  if (pass !== pass2) { toast('Las contraseñas no coinciden', 'error'); return; }
  if (DB.usuarios.find(u => u.curp === curp)) { toast('Este CURP ya está registrado', 'error'); return; }
  const hash = await sha256(pass);
  const nuevo = { id: DB._nextUsuarioId++, curp, nombre, apellidos, telefono: tel||null, password: hash, es_menor: menor?1:0, fecha_reg: fechaLocal(), activo: 1 };
  DB.usuarios.push(nuevo);
  guardarDB();
  usuarioActual = nuevo;
  iniciarSesionUsuario();
  toast('Cuenta creada exitosamente', 'exito');
}

function abrirLoginAdmin() {
  document.getElementById('adm-user').value = '';
  document.getElementById('adm-pass').value = '';
  abrirModal('modal-login-admin');
}

async function hacerLoginAdmin() {
  const user = document.getElementById('adm-user').value.trim();
  const pass = document.getElementById('adm-pass').value;
  const hash = await sha256(pass);
  const admin = DB.admins.find(a => a.usuario === user && a.password === hash);
  if (!admin) { toast('Credenciales incorrectas', 'error'); return; }
  cerrarModal('modal-login-admin');
  mostrarPantalla('admin');
  cambiarTabAdmin('dashboard');
  toast('Sesión administrativa iniciada', 'exito');
}

function cerrarSesion() { usuarioActual = null; limpiarCamposSensibles(); mostrarPantalla('login'); }
function cerrarSesionAdmin() { limpiarCamposSensibles(); mostrarPantalla('login'); }

// ══════════════════════════════════════════════════════════════════════════════
//  NAVEGACIÓN USUARIO
// ══════════════════════════════════════════════════════════════════════════════
function cambiarTab(nombre) {
  document.querySelectorAll('#pantalla-usuario .tab-panel').forEach(p => p.classList.remove('activo'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('activo'));
  document.getElementById('tab-' + nombre).classList.add('activo');
  document.querySelectorAll('.nav-btn').forEach(b => {
    const t = b.textContent.toLowerCase();
    if ((nombre==='catalogo' && t.includes('catálogo')) ||
        (nombre==='prestamos' && t.includes('préstamos')) ||
        (nombre==='historial' && t.includes('historial'))) b.classList.add('activo');
  });
  if (nombre === 'catalogo')  renderCatalogo();
  if (nombre === 'prestamos') renderMisPrestamos();
  if (nombre === 'historial') renderHistorial();
}

// ══════════════════════════════════════════════════════════════════════════════
//  CATÁLOGO
// ══════════════════════════════════════════════════════════════════════════════
function renderGeneroFiltros() {
  const generos = ['todos', ...new Set(DB.libros.map(l => l.genero).filter(Boolean))];
  document.getElementById('genero-filtros').innerHTML = generos.map(g =>
    '<span class="filtro-chip ' + (g===filtroGeneroActual?'activo':'') + '" onclick="filtrarGenero(\'' + g + '\')">' + (g==='todos'?'Todos':g) + '</span>'
  ).join('');
}

function filtrarGenero(g) { filtroGeneroActual = g; renderCatalogo(); }
function filtrarCatalogo() { renderCatalogo(); }

function renderCatalogo() {
  renderGeneroFiltros();
  const q = (document.getElementById('busqueda-catalogo')?.value || '').toLowerCase();
  let libros = DB.libros;
  if (filtroGeneroActual !== 'todos') libros = libros.filter(l => l.genero === filtroGeneroActual);
  if (q) libros = libros.filter(l => l.titulo.toLowerCase().includes(q) || l.autor.toLowerCase().includes(q) || l.codigo.toLowerCase().includes(q));
  const grid = document.getElementById('libros-grid');
  if (!libros.length) {
    grid.innerHTML = '<div class="vacio" style="grid-column:1/-1"><span class="vacio-icono">📭</span><h3>Sin resultados</h3><p>Prueba con otra búsqueda</p></div>';
    return;
  }
  grid.innerHTML = libros.map(l => {
    const disp  = copiasDisponibles(l);
    const total = copiasTotales(l);
    return `
    <div class="libro-card" onclick="abrirModalPrestamo(${l.id})">
      <div class="libro-portada">
        <div class="libro-portada-bg" style="background:${generoBg(l.genero)}"></div>
        <img src="grupomexicologo1.png" class="libro-portada-logo" alt="Logo" style="filter:${generoCssFilter(l.genero)}">
        ${total > 1 ? `<span class="libro-existencias">${disp}/${total}</span>` : ''}
      </div>
      <div class="libro-info">
        <div class="libro-titulo">${escapeHtml(l.titulo)}</div>
        <div class="libro-autor">${escapeHtml(l.autor)}</div>
        <div class="libro-footer">
          <span class="badge ${disp > 0 ? 'badge-verde' : 'badge-rojo'}">${disp > 0 ? '● ' + disp + ' disponible' + (disp>1?'s':'') : '● No disponible'}</span>
          <span style="font-size:12px;color:var(--gris-medio)">${l.anio||''}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRÉSTAMO
// ══════════════════════════════════════════════════════════════════════════════
function abrirModalPrestamo(libroId) {
  const libro = DB.libros.find(l => l.id === libroId);
  if (!libro) return;
  const disp = copiasDisponibles(libro);
  if (disp <= 0) { toast('No quedan ejemplares disponibles de este libro', 'error'); return; }
  libroSeleccionado = libro;
  diasPrestamo = 7;
  document.querySelectorAll('.dia-btn').forEach(b => b.classList.remove('seleccionado'));
  document.querySelector('.dia-btn').classList.add('seleccionado');
  document.getElementById('modal-prestamo-libro-info').innerHTML =
    '<strong style="font-family:\'Playfair Display\',serif;font-size:16px">' + escapeHtml(libro.titulo) + '</strong><br>' +
    '<span style="color:var(--gris-medio);font-size:14px">' + escapeHtml(libro.autor) + ' · ' + escapeHtml(libro.genero) + '</span><br>' +
    '<span style="color:var(--gris-medio);font-size:13px">Ejemplares disponibles: <strong>' + disp + '</strong> de ' + copiasTotales(libro) + '</span>';
  actualizarResumenPrestamo();
  abrirModal('modal-prestamo');
}

function seleccionarDias(d, btn) {
  diasPrestamo = d;
  document.querySelectorAll('.dia-btn').forEach(b => b.classList.remove('seleccionado'));
  btn.classList.add('seleccionado');
  actualizarResumenPrestamo();
}

function actualizarResumenPrestamo() {
  const hoy = new Date();
  const lim = new Date(); lim.setDate(lim.getDate() + diasPrestamo);
  document.getElementById('prestamo-resumen').innerHTML =
    '<div class="fila"><span>Fecha de préstamo</span><strong>' + hoy.toLocaleDateString('es-MX') + '</strong></div>' +
    '<div class="fila"><span>Fecha límite de devolución</span><strong>' + lim.toLocaleDateString('es-MX') + '</strong></div>' +
    '<div class="fila"><span>Duración</span><strong>' + diasPrestamo + ' días</strong></div>';
}

async function confirmarPrestamo() {
  if (!libroSeleccionado || !usuarioActual) return;
  // Cuando Firestore avisa de un cambio, DB se reemplaza completo y la
  // referencia que guardamos al abrir el modal queda desactualizada. Se vuelve
  // a buscar el libro por id para trabajar siempre con los datos más recientes.
  const libro = DB.libros.find(l => l.id === libroSeleccionado.id);
  if (!libro) {
    toast('Este libro ya no existe en el catálogo', 'error');
    cerrarModal('modal-prestamo');
    renderCatalogo();
    return;
  }
  libroSeleccionado = libro;
  const yaActivo = DB.prestamos.find(p => p.usuario_id===usuarioActual.id && p.libro_id===libro.id && !p.fecha_devolucion);
  if (yaActivo) { toast('Ya tienes este libro en préstamo', 'error'); return; }
  // Revalida contra el estado más reciente: otra persona pudo apartar el último
  // ejemplar mientras este modal estaba abierto.
  if (copiasDisponibles(libro) <= 0) {
    toast('Alguien acaba de apartar el último ejemplar disponible', 'error');
    cerrarModal('modal-prestamo');
    renderCatalogo();
    return;
  }
  const fechaPrestamo = fechaLocal();
  const limDate = new Date(); limDate.setDate(limDate.getDate() + diasPrestamo);
  const fechaLimite = limDate.toISOString().split('T')[0] + ' 23:59:59';
  const prestamo = { id: DB._nextPrestamoId++, usuario_id: usuarioActual.id, libro_id: libroSeleccionado.id, fecha_prestamo: fechaPrestamo, fecha_limite: fechaLimite, fecha_devolucion: null, estado: 'activo' };
  DB.prestamos.push(prestamo);
  guardarDB();
  cerrarModal('modal-prestamo');
  toast('Préstamo registrado: "' + libroSeleccionado.titulo + '"', 'exito');
  imprimirComprobante(prestamo, libroSeleccionado, usuarioActual);
  renderCatalogo();
}

// Construye el contenido del comprobante. Es el mismo formato tanto para la
// impresión original como para las reimpresiones, y el folio siempre es el id
// del préstamo, así que un ticket reimpreso es idéntico al primero.
function construirComprobante(prestamo, libro, usuario, esCopia) {
  return '<div class="comp-fila"><span><b>Folio:</b></span><span>#' + String(prestamo.id).padStart(4,'0') + '</span></div>' +
    '<div class="comp-fila"><span><b>Libro:</b></span><span>' + escapeHtml(libro?.titulo || 'N/A') + '</span></div>' +
    '<div class="comp-fila"><span><b>Autor:</b></span><span>' + escapeHtml(libro?.autor || '—') + '</span></div>' +
    '<div class="comp-fila"><span><b>Usuario:</b></span><span>' + escapeHtml(usuario ? usuario.nombre + ' ' + usuario.apellidos : 'N/A') + '</span></div>' +
    '<div class="comp-fila"><span><b>CURP:</b></span><span>' + escapeHtml(usuario?.curp || '—') + '</span></div>' +
    '<div class="comp-fila"><span><b>Fecha préstamo:</b></span><span>' + formatFecha(prestamo.fecha_prestamo) + '</span></div>' +
    '<div class="comp-fila"><span><b>Fecha límite:</b></span><span>' + formatFecha(prestamo.fecha_limite) + '</span></div>' +
    (prestamo.fecha_devolucion ? '<div class="comp-fila"><span><b>Devuelto el:</b></span><span>' + formatFecha(prestamo.fecha_devolucion) + '</span></div>' : '') +
    (esCopia ? '<p style="margin-top:16px;font-size:12px;color:#C0392B;font-weight:600">— COPIA / REIMPRESIÓN —</p>' : '') +
    '<p style="margin-top:24px;font-size:12px;color:#888">Conserva este comprobante. Al vencerse el plazo podrían aplicarse restricciones al servicio.</p>';
}

function imprimirComprobante(prestamo, libro, usuario) {
  document.getElementById('comp-contenido').innerHTML = construirComprobante(prestamo, libro, usuario, false);
  setTimeout(() => window.print(), 400);
}

// Reimpresión desde el panel administrativo, ligada al folio = id del préstamo.
function reimprimirComprobante(prestamoId) {
  const p = DB.prestamos.find(x => x.id === prestamoId);
  if (!p) { toast('No se encontró el préstamo', 'error'); return; }
  const libro   = DB.libros.find(l => l.id === p.libro_id);
  const usuario = DB.usuarios.find(u => u.id === p.usuario_id);

  // Vista previa en pantalla antes de mandar a imprimir.
  document.getElementById('vista-comp-folio').textContent = '#' + String(p.id).padStart(4,'0');
  document.getElementById('vista-comp-contenido').innerHTML = construirComprobante(p, libro, usuario, true);
  document.getElementById('modal-ver-comprobante').dataset.prestamoId = p.id;
  abrirModal('modal-ver-comprobante');
}

// Manda a imprimir el comprobante que se está viendo en la vista previa.
function imprimirDesdeVista() {
  const id = Number(document.getElementById('modal-ver-comprobante').dataset.prestamoId);
  const p = DB.prestamos.find(x => x.id === id);
  if (!p) return;
  const libro   = DB.libros.find(l => l.id === p.libro_id);
  const usuario = DB.usuarios.find(u => u.id === p.usuario_id);
  document.getElementById('comp-contenido').innerHTML = construirComprobante(p, libro, usuario, true);
  cerrarModal('modal-ver-comprobante');
  setTimeout(() => window.print(), 300);
}

// ══════════════════════════════════════════════════════════════════════════════
//  MIS PRÉSTAMOS
// ══════════════════════════════════════════════════════════════════════════════
function renderMisPrestamos() {
  const mis = DB.prestamos.filter(p => p.usuario_id===usuarioActual.id && !p.fecha_devolucion);
  const cont = document.getElementById('lista-mis-prestamos');
  if (!mis.length) {
    cont.innerHTML = '<div class="vacio"><span class="vacio-icono">📭</span><h3>Sin préstamos activos</h3><p>Ve al catálogo y solicita un libro</p></div>';
    return;
  }
  cont.innerHTML = mis.map(p => {
    const libro = DB.libros.find(l => l.id===p.libro_id);
    const dias  = diasRestantes(p.fecha_limite);
    return `<div class="prestamo-card">
      <div class="prestamo-icono">${generoEmoji(libro?.genero)}</div>
      <div class="prestamo-info">
        <div class="prestamo-titulo">${libro?.titulo||'Libro eliminado'}</div>
        <div class="prestamo-meta">${libro?.autor||''} · Vence el ${formatFecha(p.fecha_limite)}
          ${dias<0?' · <span style="color:var(--rojo);font-weight:600">VENCIDO</span>':' · '+dias+' día(s) restante(s)'}
        </div>
      </div>
      <div class="prestamo-acciones">
        ${estadoBadge(p.estado,p.fecha_limite,p.fecha_devolucion)}
        <button class="btn btn-primario btn-sm" onclick="devolverLibro(${p.id})">Devolver</button>
      </div>
    </div>`;
  }).join('');
}

function devolverLibro(prestamoId) {
  const p = DB.prestamos.find(x => x.id===prestamoId);
  if (!p) return;
  // Registrar devolución — el libro NO queda disponible aún, pasa a revisión
  p.fecha_devolucion = fechaLocal();
  p.estado = 'devuelto';
  // libro.disponible se mantiene en 0 hasta que admin confirme revisión
  DB.revision.push({
    id: DB._nextRevisionId++,
    prestamo_id: p.id,
    libro_id: p.libro_id,
    usuario_id: p.usuario_id,
    fecha_devolucion: p.fecha_devolucion
  });
  guardarDB();
  renderMisPrestamos();
  // Mostrar aviso del estante
  abrirModal('modal-aviso-devolucion');
}

// ══════════════════════════════════════════════════════════════════════════════
//  HISTORIAL
// ══════════════════════════════════════════════════════════════════════════════
function renderHistorial() {
  const mis = DB.prestamos.filter(p => p.usuario_id===usuarioActual.id);
  const tbody = document.getElementById('historial-body');
  if (!mis.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="vacio"><span class="vacio-icono">📋</span><h3>Sin historial</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = [...mis].reverse().map(p => {
    const libro = DB.libros.find(l => l.id===p.libro_id);
    return `<tr>
      <td><strong>${libro?.titulo||'N/A'}</strong></td>
      <td>${libro?.autor||''}</td>
      <td>${formatFecha(p.fecha_prestamo)}</td>
      <td>${formatFecha(p.fecha_limite)}</td>
      <td>${formatFecha(p.fecha_devolucion)}</td>
      <td>${estadoBadge(p.estado,p.fecha_limite,p.fecha_devolucion)}</td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — NAVEGACIÓN
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_TABS = ['dashboard','prestamos-admin','revision','inventario','usuarios-admin','config'];

function cambiarTabAdmin(nombre) {
  document.querySelectorAll('#pantalla-admin .tab-panel').forEach(p => p.classList.remove('activo'));
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('activo'));
  document.getElementById('tab-' + nombre).classList.add('activo');
  const idx = ADMIN_TABS.indexOf(nombre);
  if (idx >= 0) document.querySelectorAll('.admin-nav-btn')[idx]?.classList.add('activo');
  if (nombre==='dashboard')      renderDashboard();
  if (nombre==='prestamos-admin') renderTablaPrestamoAdmin();
  if (nombre==='revision')       renderRevision();
  if (nombre==='inventario')     renderInventario();
  if (nombre==='usuarios-admin') renderUsuariosAdmin();
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function renderDashboard() {
  const titulos         = DB.libros.length;
  const totalLibros     = DB.libros.reduce((s, l) => s + copiasTotales(l), 0);
  const disponibles     = DB.libros.reduce((s, l) => s + copiasDisponibles(l), 0);
  const prestamosActivos = DB.prestamos.filter(p => !p.fecha_devolucion).length;
  const usuarios        = DB.usuarios.filter(u => u.activo).length;
  const enRevision      = DB.revision.length;

  document.getElementById('stats-grid').innerHTML =
    '<div class="stat-card stat-rojo"><div class="stat-icono">📚</div><div class="stat-valor">' + totalLibros + '</div><div class="stat-label">Ejemplares totales (' + titulos + ' títulos)</div></div>' +
    '<div class="stat-card stat-verde"><div class="stat-icono">✅</div><div class="stat-valor">' + disponibles + '</div><div class="stat-label">Disponibles</div></div>' +
    '<div class="stat-card stat-cafe"><div class="stat-icono">🔄</div><div class="stat-valor">' + prestamosActivos + '</div><div class="stat-label">En préstamo</div></div>' +
    '<div class="stat-card stat-naranja"><div class="stat-icono">🔍</div><div class="stat-valor">' + enRevision + '</div><div class="stat-label">En revisión</div></div>' +
    '<div class="stat-card"><div class="stat-icono">👥</div><div class="stat-valor">' + usuarios + '</div><div class="stat-label">Usuarios activos</div></div>';

  const recientes = [...DB.prestamos].reverse().slice(0, 8);
  const tbody = document.getElementById('tabla-recientes');
  if (!recientes.length) { tbody.innerHTML = '<tr><td colspan="5"><div class="vacio" style="padding:30px">Sin préstamos registrados</div></td></tr>'; return; }
  tbody.innerHTML = recientes.map(p => {
    const u = DB.usuarios.find(x => x.id===p.usuario_id);
    const l = DB.libros.find(x => x.id===p.libro_id);
    return '<tr><td>' + (u?u.nombre+' '+u.apellidos:'N/A') + '</td><td>' + (l?.titulo||'N/A') + '</td><td>' + formatFecha(p.fecha_prestamo) + '</td><td>' + formatFecha(p.fecha_limite) + '</td><td>' + estadoBadge(p.estado,p.fecha_limite,p.fecha_devolucion) + '</td></tr>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — LIBROS A REVISIÓN
// ══════════════════════════════════════════════════════════════════════════════
function renderRevision() {
  const lista = DB.revision;
  const cont  = document.getElementById('lista-revision');
  if (!lista.length) {
    cont.innerHTML = '<div class="vacio"><span class="vacio-icono">✅</span><h3>Sin libros pendientes</h3><p>Todos los libros devueltos ya han sido revisados y están disponibles.</p></div>';
    return;
  }
  cont.innerHTML = lista.map(r => {
    const libro   = DB.libros.find(l => l.id===r.libro_id);
    const prestamo = DB.prestamos.find(p => p.id===r.prestamo_id);
    const usuario = DB.usuarios.find(u => u.id===r.usuario_id);
    return `<div class="revision-card" id="rev-${r.id}">
      <div style="font-size:42px;flex-shrink:0;margin-top:2px">${generoEmoji(libro?.genero)}</div>
      <div class="revision-info">
        <div class="revision-titulo">${libro?.titulo||'Libro N/A'}</div>
        <div class="revision-meta">
          <span>✍️ <strong>${libro?.autor||'—'}</strong></span>&nbsp;&nbsp;
          <span>🏷️ <strong>${libro?.genero||'—'}</strong></span>&nbsp;&nbsp;
          <span>📋 Código: <strong>${libro?.codigo||'—'}</strong></span><br>
          <span>👤 Devuelto por: <strong>${usuario?usuario.nombre+' '+usuario.apellidos:'N/A'}</strong></span>&nbsp;&nbsp;
          <span>📅 Fecha devolución: <strong>${formatFecha(r.fecha_devolucion)}</strong></span>
          ${prestamo?'&nbsp;&nbsp;<span>📆 Prestado el: <strong>'+formatFecha(prestamo.fecha_prestamo)+'</strong></span>':''}
        </div>
      </div>
      <div style="flex-shrink:0;padding-top:4px">
        <button class="btn btn-verde" onclick="marcarRevisado(${r.id})">✓ Revisado</button>
      </div>
    </div>`;
  }).join('');
}

function marcarRevisado(revisionId) {
  const r = DB.revision.find(x => x.id===revisionId);
  if (!r) return;
  const libro = DB.libros.find(l => l.id===r.libro_id);
  DB.revision = DB.revision.filter(x => x.id!==revisionId);
  guardarDB();
  toast('"' + (libro?.titulo||'Libro') + '" ya está disponible en el catálogo', 'exito');
  renderRevision();
  if (document.getElementById('tab-dashboard').classList.contains('activo')) renderDashboard();
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — PRÉSTAMOS
// ══════════════════════════════════════════════════════════════════════════════
function renderTablaPrestamoAdmin() {
  const filtro = document.getElementById('filtro-estado-prestamo')?.value || '';
  let prestamos = [...DB.prestamos].reverse();
  if (filtro==='vencido')  prestamos = prestamos.filter(p => !p.fecha_devolucion && diasRestantes(p.fecha_limite)<0);
  if (filtro==='activo')   prestamos = prestamos.filter(p => !p.fecha_devolucion && diasRestantes(p.fecha_limite)>=0);
  if (filtro==='devuelto') prestamos = prestamos.filter(p => !!p.fecha_devolucion);
  const tbody = document.getElementById('tabla-prestamos-admin');
  if (!prestamos.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="vacio" style="padding:30px">Sin registros</div></td></tr>'; return; }
  tbody.innerHTML = prestamos.map(p => {
    const u = DB.usuarios.find(x => x.id===p.usuario_id);
    const l = DB.libros.find(x => x.id===p.libro_id);
    const puede = !p.fecha_devolucion;
    const folio = '#' + String(p.id).padStart(4,'0');
    const acciones =
      '<button class="btn btn-ghost btn-sm" onclick="reimprimirComprobante(' + p.id + ')" title="Ver / reimprimir comprobante ' + folio + '">🧾</button>' +
      (puede ? ' <button class="btn btn-verde btn-sm" onclick="adminDevolverLibro('+p.id+')">Registrar devolución</button>' : '');
    return '<tr><td><span class="folio-tag">' + folio + '</span> ' + (u?escapeHtml(u.nombre+' '+u.apellidos):'N/A') + '</td><td>' + escapeHtml(l?.titulo||'N/A') + '</td><td>' + formatFecha(p.fecha_prestamo) + '</td><td>' + formatFecha(p.fecha_limite) + '</td><td>' + formatFecha(p.fecha_devolucion) + '</td><td>' + estadoBadge(p.estado,p.fecha_limite,p.fecha_devolucion) + '</td><td style="white-space:nowrap">' + acciones + '</td></tr>';
  }).join('');
}

function adminDevolverLibro(prestamoId) {
  const p = DB.prestamos.find(x => x.id===prestamoId);
  if (!p) return;
  p.fecha_devolucion = fechaLocal();
  p.estado = 'devuelto';
  // También pasa a revisión
  DB.revision.push({ id: DB._nextRevisionId++, prestamo_id: p.id, libro_id: p.libro_id, usuario_id: p.usuario_id, fecha_devolucion: p.fecha_devolucion });
  guardarDB();
  toast('Devolución registrada — libro enviado a revisión', 'info');
  renderTablaPrestamoAdmin();
  renderDashboard();
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — INVENTARIO
// ══════════════════════════════════════════════════════════════════════════════
function generarCodigoLibro() {
  let numMax = 0;
  DB.libros.forEach(l => {
    const match = l.codigo.match(/LIB-(\d+)/);
    if (match) numMax = Math.max(numMax, parseInt(match[1]));
  });
  return 'LIB-' + String(numMax + 1).padStart(3, '0');
}

function renderInventario() {
  const q = (document.getElementById('busqueda-inv')?.value||'').toLowerCase();
  let libros = DB.libros;
  if (q) libros = libros.filter(l => l.titulo.toLowerCase().includes(q)||l.autor.toLowerCase().includes(q)||l.codigo.toLowerCase().includes(q));
  const tbody = document.getElementById('tabla-inventario');
  tbody.innerHTML = libros.map(l => {
    const total  = copiasTotales(l);
    const disp   = copiasDisponibles(l);
    const prest  = copiasPrestadas(l);
    const enRev  = copiasEnRevision(l);

    let estadoHTML;
    if (disp > 0) estadoHTML = '<span class="badge badge-verde">' + disp + ' disponible' + (disp>1?'s':'') + '</span>';
    else if (enRev > 0) estadoHTML = '<span class="badge badge-naranja">🔍 En revisión</span>';
    else estadoHTML = '<span class="badge badge-rojo">Sin ejemplares</span>';

    const detalle = [];
    if (prest > 0) detalle.push(prest + ' prestado' + (prest>1?'s':''));
    if (enRev > 0) detalle.push(enRev + ' en revisión');

    return '<tr>' +
      '<td><code style="background:var(--crema-2);padding:2px 6px;border-radius:4px;font-size:12px">' + escapeHtml(l.codigo) + '</code></td>' +
      '<td><strong>' + escapeHtml(l.titulo) + '</strong></td>' +
      '<td>' + escapeHtml(l.autor) + '</td>' +
      '<td><span class="badge badge-cafe">' + escapeHtml(l.genero) + '</span></td>' +
      '<td>' + (l.anio||'—') + '</td>' +
      '<td class="celda-existencias">' +
        '<button class="btn-exist" onclick="ajustarExistencias(' + l.id + ',-1)" title="Quitar un ejemplar">−</button>' +
        '<strong class="exist-num">' + total + '</strong>' +
        '<button class="btn-exist" onclick="ajustarExistencias(' + l.id + ',1)" title="Agregar un ejemplar">+</button>' +
      '</td>' +
      '<td>' + estadoHTML + (detalle.length ? '<br><span style="font-size:11px;color:var(--gris-medio)">' + detalle.join(' · ') + '</span>' : '') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="abrirEditarLibro(' + l.id + ')" title="Editar">✏️</button> <button class="btn btn-ghost btn-sm" onclick="abrirEliminarLibro(' + l.id + ')" title="Eliminar">🗑</button></td>' +
      '</tr>';
  }).join('');
}

// Suma o resta ejemplares directamente desde la tabla de inventario.
function ajustarExistencias(libroId, delta) {
  const l = DB.libros.find(x => x.id === libroId);
  if (!l) return;
  const nuevoTotal = copiasTotales(l) + delta;
  const enUso = copiasPrestadas(l) + copiasEnRevision(l);
  if (nuevoTotal < 1) { toast('Un título debe tener al menos 1 ejemplar', 'error'); return; }
  if (nuevoTotal < enUso) {
    toast('No puedes bajar a ' + nuevoTotal + ': hay ' + enUso + ' ejemplar(es) prestado(s) o en revisión', 'error');
    return;
  }
  l.total = nuevoTotal;
  guardarDB();
  renderInventario();
}

function abrirEditarLibro(libroId) {
  const l = DB.libros.find(x => x.id===libroId);
  if (!l) return;
  document.getElementById('el-codigo').value = l.codigo;
  document.getElementById('el-titulo').value = l.titulo;
  document.getElementById('el-autor').value = l.autor;
  document.getElementById('el-editorial').value = l.editorial||'';
  document.getElementById('el-anio').value = l.anio||'';
  poblarSelectGeneros('el-genero', l.genero);
  document.getElementById('el-total').value = copiasTotales(l);
  document.getElementById('el-existencias-info').textContent =
    copiasPrestadas(l) + ' prestado(s) · ' + copiasEnRevision(l) + ' en revisión · ' + copiasDisponibles(l) + ' disponible(s)';
  document.getElementById('modal-editar-libro').dataset.libroId = libroId;
  document.getElementById('modal-editar-libro').dataset.codigoOriginal = l.codigo;
  abrirModal('modal-editar-libro');
}

function guardarEdicionLibro() {
  const libroId = document.getElementById('modal-editar-libro').dataset.libroId;
  const codigoOriginal = document.getElementById('modal-editar-libro').dataset.codigoOriginal;
  const l = DB.libros.find(x => x.id==libroId);
  if (!l) return;
  const codigo = document.getElementById('el-codigo').value.trim();
  const titulo = document.getElementById('el-titulo').value.trim();
  const autor = document.getElementById('el-autor').value.trim();
  const editorial = document.getElementById('el-editorial').value.trim();
  const anio = document.getElementById('el-anio').value.trim();
  const genero = document.getElementById('el-genero').value;
  const total  = parseInt(document.getElementById('el-total').value, 10);
  if (!titulo||!autor) { toast('Título y autor son obligatorios', 'error'); return; }
  if (!codigo) { toast('El código es obligatorio', 'error'); return; }
  if (!Number.isFinite(total) || total < 1) { toast('Las existencias deben ser al menos 1', 'error'); return; }
  const enUso = copiasPrestadas(l) + copiasEnRevision(l);
  if (total < enUso) {
    toast('No puedes poner ' + total + ' ejemplares: hay ' + enUso + ' prestado(s) o en revisión', 'error');
    return;
  }
  if (codigo !== codigoOriginal && DB.libros.find(lib => lib.codigo===codigo)) {
    document.getElementById('cod-dup-valor').textContent = codigo;
    document.getElementById('cod-sugerido').textContent = generarCodigoLibro();
    document.getElementById('modal-editar-libro').dataset.codigoNuevo = codigo;
    abrirModal('modal-codigo-duplicado');
    return;
  }
  l.codigo = codigo;
  l.titulo = titulo;
  l.autor = autor;
  l.editorial = editorial||null;
  l.anio = anio||null;
  l.genero = genero;
  l.total = total;
  guardarDB();
  cerrarModal('modal-editar-libro');
  renderInventario();
  toast('Libro actualizado', 'exito');
}

function abrirModalAgregarLibro() {
  ['nl-titulo','nl-autor','nl-editorial','nl-anio'].forEach(id => document.getElementById(id).value='');
  document.getElementById('nl-codigo').value = generarCodigoLibro();
  document.getElementById('nl-total').value = 1;
  poblarSelectGeneros('nl-genero', listaGeneros()[0]);
  abrirModal('modal-agregar-libro');
}

function guardarNuevoLibro() {
  const codigo    = document.getElementById('nl-codigo').value.trim();
  const titulo    = document.getElementById('nl-titulo').value.trim();
  const autor     = document.getElementById('nl-autor').value.trim();
  const editorial = document.getElementById('nl-editorial').value.trim();
  const anio      = document.getElementById('nl-anio').value.trim();
  const genero    = document.getElementById('nl-genero').value;
  const total     = parseInt(document.getElementById('nl-total').value, 10);
  if (!codigo||!titulo||!autor) { toast('Código, título y autor son obligatorios', 'error'); return; }
  if (!Number.isFinite(total) || total < 1) { toast('Las existencias deben ser al menos 1', 'error'); return; }
  if (DB.libros.find(l => l.codigo===codigo)) {
    document.getElementById('cod-dup-valor').textContent = codigo;
    document.getElementById('cod-sugerido').textContent = generarCodigoLibro();
    abrirModal('modal-codigo-duplicado');
    return;
  }
  DB.libros.push({ id: DB._nextLibroId++, codigo, titulo, autor, editorial:editorial||null, anio:anio||null, genero, total, disponible:1, fecha_alta:fechaLocal() });
  guardarDB();
  cerrarModal('modal-agregar-libro');
  renderInventario();
  toast('Libro "' + titulo + '" agregado (' + total + ' ejemplar' + (total>1?'es':'') + ')', 'exito');
}

function usarCodigoSugerido() {
  const sugerido = document.getElementById('cod-sugerido').textContent;
  document.getElementById('nl-codigo').value = sugerido;
  document.getElementById('el-codigo').value = sugerido;
  cerrarModal('modal-codigo-duplicado');
}

function abrirEliminarLibro(libroId) {
  const l = DB.libros.find(x => x.id===libroId);
  if (!l) return;
  const enUso = copiasPrestadas(l) + copiasEnRevision(l);
  if (enUso > 0) {
    toast('No se puede eliminar: hay ' + enUso + ' ejemplar(es) prestado(s) o en revisión', 'error');
    return;
  }
  document.getElementById('libro-eliminar-nombre').textContent = l.titulo;
  // Se guarda como texto en el dataset; al leerlo hay que convertirlo a número.
  document.getElementById('modal-confirmar-eliminar-libro').dataset.libroId = libroId;
  abrirModal('modal-confirmar-eliminar-libro');
}

function confirmarEliminarLibro() {
  // BUGFIX: dataset siempre devuelve texto ("5"), y los ids son números (5).
  // La comparación estricta === nunca coincidía, así que nunca se borraba nada.
  const libroId = Number(document.getElementById('modal-confirmar-eliminar-libro').dataset.libroId);
  const l = DB.libros.find(x => x.id === libroId);
  if (!l) { toast('No se encontró el libro', 'error'); return; }
  const titulo = l.titulo;
  DB.libros = DB.libros.filter(x => x.id !== libroId);
  guardarDB();
  cerrarModal('modal-confirmar-eliminar-libro');
  renderInventario();
  toast('Libro "' + titulo + '" eliminado', 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — GESTIÓN DE GÉNEROS
//  Los cambios se aplican en cascada: renombrar un género actualiza también
//  todos los libros que ya estaban etiquetados con el nombre anterior.
// ══════════════════════════════════════════════════════════════════════════════
let generoEditando = null;   // nombre del género que se está renombrando
let generoEliminando = null; // nombre del género pendiente de eliminar

function abrirGestorGeneros() {
  generoEditando = null;
  document.getElementById('gen-nuevo').value = '';
  document.getElementById('gen-form-titulo').textContent = 'Agregar género';
  document.getElementById('gen-btn-guardar').textContent = 'Agregar';
  document.getElementById('gen-btn-cancelar-edicion').style.display = 'none';
  renderListaGeneros();
  abrirModal('modal-generos');
}

// Cuántos libros usan cada género.
function librosPorGenero(nombre) {
  return DB.libros.filter(l => l.genero === nombre).length;
}

function renderListaGeneros() {
  const cont = document.getElementById('lista-generos');
  const generos = listaGeneros();
  if (!generos.length) {
    cont.innerHTML = '<div class="vacio" style="padding:24px"><p>No hay géneros registrados</p></div>';
    return;
  }
  cont.innerHTML = generos.map(g => {
    const n = librosPorGenero(g);
    return '<div class="genero-fila">' +
      '<div class="genero-nombre">' +
        '<span class="genero-emoji">' + generoEmoji(g) + '</span>' +
        '<span>' + escapeHtml(g) + '</span>' +
        '<span class="genero-conteo">' + n + ' libro' + (n===1?'':'s') + '</span>' +
      '</div>' +
      '<div class="genero-acciones">' +
        '<button class="btn btn-ghost btn-sm" onclick="editarGenero(' + JSON.stringify(g).replace(/"/g,'&quot;') + ')" title="Renombrar">✏️</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="abrirEliminarGenero(' + JSON.stringify(g).replace(/"/g,'&quot;') + ')" title="Eliminar">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function editarGenero(nombre) {
  generoEditando = nombre;
  document.getElementById('gen-nuevo').value = nombre;
  document.getElementById('gen-form-titulo').textContent = 'Renombrar "' + nombre + '"';
  document.getElementById('gen-btn-guardar').textContent = 'Guardar cambio';
  document.getElementById('gen-btn-cancelar-edicion').style.display = 'inline-flex';
  document.getElementById('gen-nuevo').focus();
}

function cancelarEdicionGenero() {
  generoEditando = null;
  document.getElementById('gen-nuevo').value = '';
  document.getElementById('gen-form-titulo').textContent = 'Agregar género';
  document.getElementById('gen-btn-guardar').textContent = 'Agregar';
  document.getElementById('gen-btn-cancelar-edicion').style.display = 'none';
}

function guardarGenero() {
  const nombre = document.getElementById('gen-nuevo').value.trim();
  if (!nombre) { toast('Escribe el nombre del género', 'error'); return; }
  if (nombre.length > 40) { toast('El nombre es demasiado largo (máx. 40 caracteres)', 'error'); return; }

  const generos = listaGeneros();
  // Compara sin distinguir mayúsculas ni acentos sobrantes de espacios.
  const yaExiste = generos.some(g =>
    g.toLowerCase() === nombre.toLowerCase() && g !== generoEditando
  );
  if (yaExiste) {
    document.getElementById('gen-dup-valor').textContent = nombre;
    abrirModal('modal-genero-duplicado');
    return;
  }

  if (generoEditando) {
    // RENOMBRAR: se aplica en cascada a todos los libros ya registrados.
    const anterior = generoEditando;
    DB.generos = generos.map(g => g === anterior ? nombre : g);
    let afectados = 0;
    DB.libros.forEach(l => {
      if (l.genero === anterior) { l.genero = nombre; afectados++; }
    });
    if (filtroGeneroActual === anterior) filtroGeneroActual = nombre;
    guardarDB();
    cancelarEdicionGenero();
    renderListaGeneros();
    renderInventario();
    toast('Género renombrado a "' + nombre + '"' + (afectados ? ' — ' + afectados + ' libro(s) actualizado(s)' : ''), 'exito');
  } else {
    // AGREGAR
    DB.generos = [...generos, nombre];
    guardarDB();
    document.getElementById('gen-nuevo').value = '';
    renderListaGeneros();
    toast('Género "' + nombre + '" agregado', 'exito');
  }
}

function abrirEliminarGenero(nombre) {
  generoEliminando = nombre;
  const n = librosPorGenero(nombre);
  document.getElementById('gen-del-nombre').textContent = nombre;
  const aviso = document.getElementById('gen-del-aviso');
  const selectorCaja = document.getElementById('gen-del-reasignar-caja');

  if (n > 0) {
    aviso.innerHTML = 'Hay <strong>' + n + ' libro(s)</strong> con este género. Elige a qué género se moverán:';
    const otros = listaGeneros().filter(g => g !== nombre);
    if (!otros.length) {
      toast('No puedes eliminar el único género existente', 'error');
      return;
    }
    document.getElementById('gen-del-destino').innerHTML =
      otros.map(g => '<option value="' + escapeHtml(g) + '">' + escapeHtml(g) + '</option>').join('');
    selectorCaja.style.display = 'block';
  } else {
    aviso.textContent = 'Ningún libro usa este género, se puede eliminar sin afectar el inventario.';
    selectorCaja.style.display = 'none';
  }
  abrirModal('modal-eliminar-genero');
}

function confirmarEliminarGenero() {
  if (!generoEliminando) return;
  const nombre = generoEliminando;
  const n = librosPorGenero(nombre);

  if (n > 0) {
    const destino = document.getElementById('gen-del-destino').value;
    if (!destino) { toast('Elige un género de destino', 'error'); return; }
    DB.libros.forEach(l => { if (l.genero === nombre) l.genero = destino; });
  }
  DB.generos = listaGeneros().filter(g => g !== nombre);
  if (filtroGeneroActual === nombre) filtroGeneroActual = 'todos';
  guardarDB();
  generoEliminando = null;
  cerrarModal('modal-eliminar-genero');
  renderListaGeneros();
  renderInventario();
  toast('Género "' + nombre + '" eliminado' + (n ? ' — ' + n + ' libro(s) reasignado(s)' : ''), 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — USUARIOS
// ══════════════════════════════════════════════════════════════════════════════
function renderUsuariosAdmin() {
  const q = (document.getElementById('busqueda-usr')?.value||'').toLowerCase();
  let usuarios = DB.usuarios;
  if (q) usuarios = usuarios.filter(u => u.nombre.toLowerCase().includes(q)||u.apellidos.toLowerCase().includes(q)||u.curp.toLowerCase().includes(q));
  const tbody = document.getElementById('tabla-usuarios-admin');
  tbody.innerHTML = usuarios.map(u =>
    '<tr><td><strong>' + u.nombre + ' ' + u.apellidos + '</strong></td>' +
    '<td><code style="background:var(--crema-2);padding:2px 6px;border-radius:4px;font-size:12px">' + u.curp + '</code></td>' +
    '<td>' + (u.telefono||'—') + '</td>' +
    '<td>' + formatFecha(u.fecha_reg) + '</td>' +
    '<td><span class="badge ' + (u.es_menor?'badge-amarillo':'badge-cafe') + '">' + (u.es_menor?'Menor':'Mayor') + '</span></td>' +
    '<td><span class="badge ' + (u.activo?'badge-verde':'badge-rojo') + '">' + (u.activo?'Activo':'Inactivo') + '</span></td>' +
    '<td><button class="btn btn-ghost btn-sm" onclick="abrirEditarUsuario(' + u.id + ')" title="Editar">✏️</button> <button class="btn btn-ghost btn-sm" onclick="toggleUsuario(' + u.id + ')">' + (u.activo?'Desact.':'Activar') + '</button></td></tr>'
  ).join('');
}

function abrirEditarUsuario(usuarioId) {
  const u = DB.usuarios.find(x => x.id===usuarioId);
  if (!u) return;
  document.getElementById('eu-nombre').value = u.nombre;
  document.getElementById('eu-apellidos').value = u.apellidos;
  document.getElementById('eu-curp').value = u.curp;
  document.getElementById('eu-telefono').value = u.telefono||'';
  document.getElementById('eu-password').value = '';
  document.getElementById('eu-menor').checked = u.es_menor?true:false;
  document.getElementById('modal-editar-usuario').dataset.usuarioId = usuarioId;
  abrirModal('modal-editar-usuario');
}

function guardarEdicionUsuario() {
  const usuarioId = document.getElementById('modal-editar-usuario').dataset.usuarioId;
  const u = DB.usuarios.find(x => x.id==usuarioId);
  if (!u) return;
  const nombre = document.getElementById('eu-nombre').value.trim();
  const apellidos = document.getElementById('eu-apellidos').value.trim();
  const curp = document.getElementById('eu-curp').value.trim().toUpperCase();
  const telefono = document.getElementById('eu-telefono').value.trim();
  const password = document.getElementById('eu-password').value;
  const esMenor = document.getElementById('eu-menor').checked;
  if (!nombre||!apellidos) { toast('Nombre y apellidos son obligatorios', 'error'); return; }
  if (!curp||curp.length<18) { toast('CURP inválido (debe tener 18 caracteres)', 'error'); return; }
  if (curp !== u.curp && DB.usuarios.find(usr => usr.curp===curp)) { toast('Este CURP ya está registrado', 'error'); return; }
  u.nombre = nombre;
  u.apellidos = apellidos;
  u.curp = curp;
  u.telefono = telefono||null;
  u.es_menor = esMenor?1:0;
  guardarDB();
  cerrarModal('modal-editar-usuario');
  renderUsuariosAdmin();
  toast('Usuario actualizado', 'exito');
}

function toggleUsuario(userId) {
  const u = DB.usuarios.find(x => x.id===userId);
  if (!u) return;
  u.activo = u.activo ? 0 : 1;
  guardarDB();
  renderUsuariosAdmin();
  toast('Usuario ' + (u.activo?'activado':'desactivado'), 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════════
async function cambiarPasswordAdmin() {
  const actual = document.getElementById('cfg-pass-actual').value;
  const nueva  = document.getElementById('cfg-pass-nueva').value;
  const conf   = document.getElementById('cfg-pass-conf').value;
  if (!actual||!nueva) { toast('Completa todos los campos', 'error'); return; }
  if (nueva !== conf)  { toast('Las contraseñas no coinciden', 'error'); return; }
  if (nueva.length<6)  { toast('Mínimo 6 caracteres', 'error'); return; }
  const hashActual = await sha256(actual);
  const admin = DB.admins[0];
  if (admin.password !== hashActual) { toast('Contraseña actual incorrecta', 'error'); return; }
  admin.password = await sha256(nueva);
  guardarDB();
  ['cfg-pass-actual','cfg-pass-nueva','cfg-pass-conf'].forEach(id => document.getElementById(id).value='');
  toast('Contraseña actualizada correctamente', 'exito');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MOSTRAR / OCULTAR CONTRASEÑA
// ══════════════════════════════════════════════════════════════════════════════
function toggleVerPassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const oculto = input.type === 'password';
  input.type = oculto ? 'text' : 'password';
  // Ojo abierto = texto visible; ojo tachado = texto oculto.
  btn.textContent = oculto ? '🙈' : '👁️';
  btn.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
  btn.setAttribute('title', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
  input.focus();
}

// Deja todos los campos sensibles en blanco y las contraseñas ocultas.
// Se llama al cargar la página y cada vez que se cierra sesión, para que
// nadie encuentre datos de otra persona escritos por descuido.
function limpiarCamposSensibles() {
  const ids = ['login-curp','login-pass','adm-user','adm-pass',
               'reg-nombre','reg-apellidos','reg-curp','reg-telefono','reg-pass','reg-pass2',
               'cfg-pass-actual','cfg-pass-nueva','cfg-pass-conf'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const menor = document.getElementById('reg-menor');
  if (menor) menor.checked = false;
  // Regresa todos los campos de contraseña a estado oculto.
  document.querySelectorAll('.toggle-pass').forEach(btn => {
    const input = document.getElementById(btn.dataset.target);
    if (input) input.type = 'password';
    btn.textContent = '👁️';
    btn.setAttribute('title', 'Mostrar contraseña');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════════════════════
document.getElementById('login-pass').addEventListener('keydown', e => { if(e.key==='Enter') hacerLogin(); });
document.getElementById('login-curp').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('login-pass').focus(); });
document.getElementById('adm-pass').addEventListener('keydown', e => { if(e.key==='Enter') hacerLoginAdmin(); });
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelectorAll('.modal-overlay.activo').forEach(m => m.classList.remove('activo'));
});
document.getElementById('login-curp').addEventListener('input', function(){ this.value = this.value.toUpperCase(); });
document.getElementById('reg-curp').addEventListener('input', function(){ this.value = this.value.toUpperCase(); });

// Algunos navegadores restauran lo que estaba escrito al recargar o al
// volver con el botón "atrás"; esto lo evita en ambos casos.
window.addEventListener('pageshow', limpiarCamposSensibles);

// ══════════════════════════════════════════════════════════════════════════════
//  ARRANQUE
// ══════════════════════════════════════════════════════════════════════════════
limpiarCamposSensibles();
iniciarBaseDeDatos();
