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

function estructuraVacia() {
  return {
    libros: SEED.libros.map(l => ({ ...l })),
    usuarios: SEED.usuarios.map(u => ({ ...u })),
    admins: SEED.admins.map(a => ({ ...a })),
    prestamos: [],
    revision: [],
    _nextLibroId: SEED.libros.length + 1,
    _nextUsuarioId: SEED.usuarios.length + 1,
    _nextPrestamoId: 1,
    _nextRevisionId: 1
  };
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
    if (!DB.revision) DB.revision = [];
    if (!DB._nextRevisionId) DB._nextRevisionId = 1;

    if (!dbListo) {
      dbListo = true;
      ocultarCargando();
      mostrarPantalla('login');
    } else {
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

function cerrarSesion() { usuarioActual = null; mostrarPantalla('login'); }
function cerrarSesionAdmin() { mostrarPantalla('login'); }

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
  grid.innerHTML = libros.map(l => `
    <div class="libro-card" onclick="abrirModalPrestamo(${l.id})">
      <div class="libro-portada">
        <div class="libro-portada-bg" style="background:${generoBg(l.genero)}"></div>
        <img src="grupomexicologo1.png" class="libro-portada-logo" alt="Logo" style="filter:${generoCssFilter(l.genero)}">
      </div>
      <div class="libro-info">
        <div class="libro-titulo">${l.titulo}</div>
        <div class="libro-autor">${l.autor}</div>
        <div class="libro-footer">
          <span class="badge ${l.disponible ? 'badge-verde' : 'badge-rojo'}">${l.disponible ? '● Disponible' : '● Prestado'}</span>
          <span style="font-size:12px;color:var(--gris-medio)">${l.anio||''}</span>
        </div>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRÉSTAMO
// ══════════════════════════════════════════════════════════════════════════════
function abrirModalPrestamo(libroId) {
  const libro = DB.libros.find(l => l.id === libroId);
  if (!libro) return;
  if (!libro.disponible) { toast('Este libro no está disponible actualmente', 'error'); return; }
  libroSeleccionado = libro;
  diasPrestamo = 7;
  document.querySelectorAll('.dia-btn').forEach(b => b.classList.remove('seleccionado'));
  document.querySelector('.dia-btn').classList.add('seleccionado');
  document.getElementById('modal-prestamo-libro-info').innerHTML =
    '<strong style="font-family:\'Playfair Display\',serif;font-size:16px">' + libro.titulo + '</strong><br>' +
    '<span style="color:var(--gris-medio);font-size:14px">' + libro.autor + ' · ' + libro.genero + '</span>';
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
  const yaActivo = DB.prestamos.find(p => p.usuario_id===usuarioActual.id && p.libro_id===libroSeleccionado.id && !p.fecha_devolucion);
  if (yaActivo) { toast('Ya tienes este libro en préstamo', 'error'); return; }
  const fechaPrestamo = fechaLocal();
  const limDate = new Date(); limDate.setDate(limDate.getDate() + diasPrestamo);
  const fechaLimite = limDate.toISOString().split('T')[0] + ' 23:59:59';
  const prestamo = { id: DB._nextPrestamoId++, usuario_id: usuarioActual.id, libro_id: libroSeleccionado.id, fecha_prestamo: fechaPrestamo, fecha_limite: fechaLimite, fecha_devolucion: null, estado: 'activo' };
  DB.prestamos.push(prestamo);
  libroSeleccionado.disponible = 0;
  guardarDB();
  cerrarModal('modal-prestamo');
  toast('Préstamo registrado: "' + libroSeleccionado.titulo + '"', 'exito');
  imprimirComprobante(prestamo, libroSeleccionado, usuarioActual);
  renderCatalogo();
}

function imprimirComprobante(prestamo, libro, usuario) {
  document.getElementById('comp-contenido').innerHTML =
    '<div class="comp-fila"><span><b>Folio:</b></span><span>#' + String(prestamo.id).padStart(4,'0') + '</span></div>' +
    '<div class="comp-fila"><span><b>Libro:</b></span><span>' + libro.titulo + '</span></div>' +
    '<div class="comp-fila"><span><b>Autor:</b></span><span>' + libro.autor + '</span></div>' +
    '<div class="comp-fila"><span><b>Usuario:</b></span><span>' + usuario.nombre + ' ' + usuario.apellidos + '</span></div>' +
    '<div class="comp-fila"><span><b>CURP:</b></span><span>' + usuario.curp + '</span></div>' +
    '<div class="comp-fila"><span><b>Fecha préstamo:</b></span><span>' + formatFecha(prestamo.fecha_prestamo) + '</span></div>' +
    '<div class="comp-fila"><span><b>Fecha límite:</b></span><span>' + formatFecha(prestamo.fecha_limite) + '</span></div>' +
    '<p style="margin-top:24px;font-size:12px;color:#888">Conserva este comprobante. Al vencerse el plazo podrían aplicarse restricciones al servicio.</p>';
  setTimeout(() => window.print(), 400);
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
  const totalLibros     = DB.libros.length;
  const disponibles     = DB.libros.filter(l => l.disponible).length;
  const prestamosActivos = DB.prestamos.filter(p => !p.fecha_devolucion).length;
  const usuarios        = DB.usuarios.filter(u => u.activo).length;
  const enRevision      = DB.revision.length;

  document.getElementById('stats-grid').innerHTML =
    '<div class="stat-card stat-rojo"><div class="stat-icono">📚</div><div class="stat-valor">' + totalLibros + '</div><div class="stat-label">Total de libros</div></div>' +
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
  if (libro) libro.disponible = 1;
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
    return '<tr><td>' + (u?u.nombre+' '+u.apellidos:'N/A') + '</td><td>' + (l?.titulo||'N/A') + '</td><td>' + formatFecha(p.fecha_prestamo) + '</td><td>' + formatFecha(p.fecha_limite) + '</td><td>' + formatFecha(p.fecha_devolucion) + '</td><td>' + estadoBadge(p.estado,p.fecha_limite,p.fecha_devolucion) + '</td><td>' + (puede?'<button class="btn btn-verde btn-sm" onclick="adminDevolverLibro('+p.id+')">Registrar devolución</button>':'—') + '</td></tr>';
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
    const enRev = DB.revision.some(r => r.libro_id===l.id);
    const estadoHTML = enRev
      ? '<span class="badge badge-naranja">🔍 En revisión</span>'
      : l.disponible ? '<span class="badge badge-verde">Disponible</span>' : '<span class="badge badge-rojo">Prestado</span>';
    return '<tr>' +
      '<td><code style="background:var(--crema-2);padding:2px 6px;border-radius:4px;font-size:12px">' + l.codigo + '</code></td>' +
      '<td><strong>' + l.titulo + '</strong></td>' +
      '<td>' + l.autor + '</td>' +
      '<td><span class="badge badge-cafe">' + l.genero + '</span></td>' +
      '<td>' + (l.anio||'—') + '</td>' +
      '<td>' + estadoHTML + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="abrirEditarLibro(' + l.id + ')" title="Editar">✏️</button> <button class="btn btn-ghost btn-sm" onclick="abrirEliminarLibro(' + l.id + ')" title="Eliminar">🗑</button></td>' +
      '</tr>';
  }).join('');
}

function abrirEditarLibro(libroId) {
  const l = DB.libros.find(x => x.id===libroId);
  if (!l) return;
  document.getElementById('el-codigo').value = l.codigo;
  document.getElementById('el-titulo').value = l.titulo;
  document.getElementById('el-autor').value = l.autor;
  document.getElementById('el-editorial').value = l.editorial||'';
  document.getElementById('el-anio').value = l.anio||'';
  document.getElementById('el-genero').value = l.genero;
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
  if (!titulo||!autor) { toast('Título y autor son obligatorios', 'error'); return; }
  if (!codigo) { toast('El código es obligatorio', 'error'); return; }
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
  guardarDB();
  cerrarModal('modal-editar-libro');
  renderInventario();
  toast('Libro actualizado', 'exito');
}

function abrirModalAgregarLibro() {
  ['nl-titulo','nl-autor','nl-editorial','nl-anio'].forEach(id => document.getElementById(id).value='');
  document.getElementById('nl-codigo').value = generarCodigoLibro();
  document.getElementById('nl-genero').value = 'Novela';
  abrirModal('modal-agregar-libro');
}

function guardarNuevoLibro() {
  const codigo    = document.getElementById('nl-codigo').value.trim();
  const titulo    = document.getElementById('nl-titulo').value.trim();
  const autor     = document.getElementById('nl-autor').value.trim();
  const editorial = document.getElementById('nl-editorial').value.trim();
  const anio      = document.getElementById('nl-anio').value.trim();
  const genero    = document.getElementById('nl-genero').value;
  if (!codigo||!titulo||!autor) { toast('Código, título y autor son obligatorios', 'error'); return; }
  if (DB.libros.find(l => l.codigo===codigo)) {
    document.getElementById('cod-dup-valor').textContent = codigo;
    document.getElementById('cod-sugerido').textContent = generarCodigoLibro();
    abrirModal('modal-codigo-duplicado');
    return;
  }
  DB.libros.push({ id: DB._nextLibroId++, codigo, titulo, autor, editorial:editorial||null, anio:anio||null, genero, disponible:1, fecha_alta:fechaLocal() });
  guardarDB();
  cerrarModal('modal-agregar-libro');
  renderInventario();
  toast('Libro "' + titulo + '" agregado', 'exito');
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
  if (!l.disponible) { toast('No se puede eliminar un libro que no está disponible', 'error'); return; }
  document.getElementById('libro-eliminar-nombre').textContent = l.titulo;
  document.getElementById('modal-confirmar-eliminar-libro').dataset.libroId = libroId;
  abrirModal('modal-confirmar-eliminar-libro');
}

function confirmarEliminarLibro() {
  const libroId = document.getElementById('modal-confirmar-eliminar-libro').dataset.libroId;
  const l = DB.libros.find(x => x.id===libroId);
  if (!l) return;
  DB.libros = DB.libros.filter(x => x.id!==libroId);
  guardarDB();
  cerrarModal('modal-confirmar-eliminar-libro');
  renderInventario();
  toast('Libro eliminado', 'info');
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

// ══════════════════════════════════════════════════════════════════════════════
//  ARRANQUE
// ══════════════════════════════════════════════════════════════════════════════
iniciarBaseDeDatos();
