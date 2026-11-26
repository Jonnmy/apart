// Cálculos y datos de «Mi apartamento en San Cristóbal».
// Todo aquí es puro (no toca la pantalla ni el almacenamiento) para poder probarlo con `node --test`.
(function (raiz) {
  'use strict';

  // ===== Constantes =====
  const KEY = 'apart_sc_v1', OLD_KEY = 'mi-apartamento-sc';
  const VERSION = 3;
  const PRECIO_TIPICO = 5025000; // RD$: un 3 habitaciones típico en San Cristóbal (anuncios de nov. 2026)
  const TAGS = [['mes', 'Ahorro del mes', '🌸'], ['bono', 'Bono del trabajo', '✨'], ['extra', 'Ingreso extra', '💼'], ['regalo', 'Regalo', '🎁'], ['venta', 'Venta', '🛍️']];
  const TAG_ALIAS = { quincena: 'mes', regalia: 'bono' };
  const MONEDAS = ['US', 'RD'];
  const LIMITE_MONTO = 10000000; // nadie registra más de 10 millones de una vez: casi seguro es un error
  const DEF = {
    v: VERSION, onboarded: false, ejemplo: false, guiaOk: false, nombre: 'Valery', moneda: 'US', tasa: 60.5,
    precio: PRECIO_TIPICO, precioMon: 'RD', metaAptId: null, metaNombre: '', metaElegida: false, planMensualUS: 1000,
    inicialPct: 20, reserva: 50000, gastosPct: 4, mudanza: 50000, saldoInicial: 0, saldoInicialMon: 'US',
    tasaHipoteca: 11.5, plazoAnos: 20,
    aportes: [], favoritos: [], favApts: [],
    ideal: { sectores: ['Madre Vieja Norte', 'Centro'], hab: 3, parqueos: 1, piso: 'cualquiera', bono: true },
    lastBackup: 0
  };

  // ===== Utilidades =====
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const esObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const tagDe = k => TAGS.find(t => t[0] === (TAG_ALIAS[k] || k)) || TAGS[2];

  // ===== Fechas (siempre en hora local: nunca toISOString, que cambia el día según la zona horaria) =====
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const ymLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  function fechaValida(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d);
    return y >= 2000 && y <= 2100 && x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
  }
  const ymd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const mesesEntre = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

  // ===== Dinero =====
  const tasaOk = t => { const n = num(t); return n > 0 ? n : DEF.tasa; };
  const toRD = (v, mon, tasa) => mon === 'US' ? num(v) * tasaOk(tasa) : num(v);
  const fromRD = (rd, mon, tasa) => mon === 'US' ? num(rd) / tasaOk(tasa) : num(rd);
  const convertir = (v, de, a, tasa) => fromRD(toRD(v, de, tasa), a, tasa);
  const simbolo = mon => mon === 'US' ? 'US$' : 'RD$';
  // Montos redondeados a la unidad. Evita «−US$0» cuando el resultado es casi cero.
  function fmt(v, mon) {
    const n = num(v), r = Math.round(Math.abs(n));
    return (n < 0 && r > 0 ? '−' : '') + simbolo(mon) + r.toLocaleString('en-US');
  }
  // Monto tal como se registró: muestra centavos solo si los tiene.
  function fmtExacto(v, mon) {
    const n = r2(Math.abs(num(v))), dec = n % 1 ? 2 : 0;
    return (num(v) < 0 && n > 0 ? '−' : '') + simbolo(mon) + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  // ===== Meta y progreso (todo en RD$ por dentro) =====
  const precioRD = s => toRD(s.precio, s.precioMon || 'RD', s.tasa);
  function meta(s) {
    const p = Math.max(0, precioRD(s));
    const inicial = p * clamp(num(s.inicialPct), 0, 100) / 100;
    const gastos = p * clamp(num(s.gastosPct), 0, 100) / 100;
    const mudanza = Math.max(0, num(s.mudanza));
    return { precio: p, inicial, gastos, mudanza, total: inicial + gastos + mudanza };
  }
  const montoRD = (a, tasa) => toRD(a.monto, a.mon, tasa);
  const totalAportes = (aportes, tasa) => (aportes || []).reduce((t, a) => t + montoRD(a, tasa), 0);
  const ahorrado = s => Math.max(0, toRD(s.saldoInicial, s.saldoInicialMon || 'RD', s.tasa)) + totalAportes(s.aportes, s.tasa);
  const totalMes = (aportes, ym, tasa) => totalAportes((aportes || []).filter(a => String(a.fecha).slice(0, 7) === ym), tasa);
  function progreso(s) {
    const m = meta(s), a = ahorrado(s);
    return {
      ahorrado: a, meta: m,
      pct: m.total > 0 ? clamp(a / m.total, 0, 1) : (a > 0 ? 1 : 0),
      falta: Math.max(0, m.total - a),
      faltaInicial: Math.max(0, m.inicial - a),
      pctInicial: m.inicial > 0 ? clamp(a / m.inicial, 0, 1) : 1
    };
  }
  // Porcentaje entero que se muestra: nunca dice 100% si falta algo.
  const pctTexto = p => p >= 1 ? 100 : Math.min(99, Math.floor(p * 100));

  function hitos(s) {
    const m = meta(s);
    return [
      { k: 'reserva', t: 'Separación', d: 'Para apartar el apartamento', v: Math.min(Math.max(0, num(s.reserva)), m.inicial) },
      { k: 'i25', t: '25% del inicial', d: 'Un cuarto del camino', v: m.inicial * .25 },
      { k: 'i50', t: 'Mitad del inicial', d: '¡Medio camino!', v: m.inicial * .5 },
      { k: 'i100', t: `Inicial completo (${num(s.inicialPct)}%)`, d: 'Lo que pide el banco', v: m.inicial },
      { k: 'total', t: 'Gastos de cierre y mudanza', d: 'Abogado, tasación, impuestos y trámites, y la mudanza', v: m.total }
    ].filter(h => h.v > 0).sort((a, b) => a.v - b.v);
  }

  // Promedio mensual de lo registrado. Cuenta desde el mes del primer registro hasta el mes actual;
  // si este mes todavía no tiene registros, no lo cuenta (así el promedio no baja el día 1).
  function promedioMensual(aportes, tasa, hoy) {
    hoy = hoy || new Date();
    const L = (aportes || []).filter(a => fechaValida(a.fecha) && ymd(a.fecha) <= hoy);
    if (!L.length) return 0;
    const primero = L.map(a => ymd(a.fecha)).sort((a, b) => a - b)[0];
    const hayEsteMes = L.some(a => a.fecha.slice(0, 7) === ymLocal(hoy));
    const meses = Math.max(1, mesesEntre(primero, hoy) + (hayEsteMes ? 1 : 0));
    return totalAportes(L, tasa) / meses;
  }

  // Proyección: cuántos meses faltan ahorrando `mensual` (y un extra en diciembre o una sola vez).
  // Si este mes ya tiene ahorro registrado, la cuenta empieza el mes que viene.
  function proyeccion(falta, mensual, opt) {
    opt = opt || {};
    const hoy = opt.hoy || new Date(), extra = Math.max(0, num(opt.extra)), anual = !!opt.anual;
    const inicio = opt.empiezaEsteMes ? 0 : 1;
    if (!(falta > 0)) return { meses: 0, fecha: new Date(hoy.getFullYear(), hoy.getMonth(), 1) };
    mensual = Math.max(0, num(mensual));
    if (mensual <= 0 && extra <= 0) return { meses: Infinity, fecha: null };
    let acc = 0;
    for (let i = 0; i < 600; i++) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth() + inicio + i, 1);
      acc += mensual;
      if (extra > 0 && (anual ? f.getMonth() === 11 : i === 0)) acc += extra;
      if (acc >= falta - 0.005) return { meses: i + 1, fecha: f };
      if (mensual <= 0 && !anual) break;
    }
    return { meses: Infinity, fecha: null };
  }

  // Cuota mensual de un préstamo (sistema francés). tasaAnual en %, plazo en años.
  function cuota(prestamo, tasaAnual, anos) {
    const P = Math.max(0, num(prestamo)), n = Math.round(num(anos) * 12), i = num(tasaAnual) / 100 / 12;
    if (P <= 0 || n <= 0) return 0;
    return i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n));
  }

  // Números de un apartamento de la lista frente a lo que ya ahorró.
  function calcApt(s, precioDelApt) {
    const p = Math.max(0, num(precioDelApt)), a = ahorrado(s);
    const ini = p * clamp(num(s.inicialPct), 0, 100) / 100;
    const total = ini + p * clamp(num(s.gastosPct), 0, 100) / 100 + Math.max(0, num(s.mudanza));
    return {
      ini, total, faltaIni: Math.max(0, ini - a), faltaTotal: Math.max(0, total - a),
      pct: ini > 0 ? clamp(a / ini, 0, 1) : 1,
      cuota: cuota(p - ini, s.tasaHipoteca, s.plazoAnos)
    };
  }

  // ===== Validación y migración de datos =====
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function urlSegura(u) {
    try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : null; } catch (_) { return null; }
  }
  function limpiarAporte(a) {
    if (!esObj(a)) return null;
    const monto = r2(num(a.monto));
    if (!(monto > 0) || monto > LIMITE_MONTO || !fechaValida(a.fecha)) return null;
    return {
      id: typeof a.id === 'string' && a.id ? a.id.slice(0, 40) : uid(),
      fecha: a.fecha, monto, mon: MONEDAS.includes(a.mon) ? a.mon : 'RD',
      tag: tagDe(a.tag)[0], nota: typeof a.nota === 'string' ? a.nota.slice(0, 140) : ''
    };
  }
  function limpiarFavorito(f) {
    if (!esObj(f)) return null;
    const url = urlSegura(f.url); if (!url) return null;
    const precio = num(f.precio);
    return {
      id: typeof f.id === 'string' && f.id ? f.id.slice(0, 40) : 'fav-' + uid(),
      titulo: String(f.titulo || 'Apartamento guardado').slice(0, 80), url,
      precio: precio > 0 ? precio : null, mon: MONEDAS.includes(f.mon) ? f.mon : 'RD',
      sector: String(f.sector || '').slice(0, 40), nota: String(f.nota || '').slice(0, 140),
      fecha: fechaValida(f.fecha) ? f.fecha : isoLocal(new Date())
    };
  }
  // Toma cualquier objeto guardado o importado y devuelve un estado válido, más la lista de avisos.
  function normalizar(o) {
    const avisos = [];
    const s = clone(DEF);
    if (!esObj(o)) return { s, avisos: ['El archivo no tiene datos'] };
    for (const k of Object.keys(DEF)) if (k in o && k !== 'ideal') s[k] = o[k];
    if (esObj(o.ideal)) s.ideal = Object.assign(clone(DEF.ideal), o.ideal);
    if (!Array.isArray(s.ideal.sectores)) s.ideal.sectores = [];
    const versionOriginal = num(o.v) || 1;

    // Números con límites razonables
    const n = (k, min, max) => { const v = num(s[k]); s[k] = isFinite(v) ? clamp(v, min, max) : DEF[k]; };
    s.tasa = num(s.tasa) > 0 ? clamp(num(s.tasa), 1, 1000) : DEF.tasa;
    n('precio', 0, 1e10); n('inicialPct', 0, 100); n('gastosPct', 0, 30); n('reserva', 0, 1e9); n('mudanza', 0, 1e9);
    n('saldoInicial', 0, 1e10); n('planMensualUS', 0, 1e7); n('tasaHipoteca', 0, 40); n('plazoAnos', 1, 40);
    if (!MONEDAS.includes(s.moneda)) s.moneda = 'US';
    s.nombre = String(s.nombre || '').slice(0, 40) || DEF.nombre;
    s.metaNombre = String(s.metaNombre || '').slice(0, 120);
    s.lastBackup = num(s.lastBackup);
    ['onboarded', 'ejemplo', 'guiaOk', 'metaElegida'].forEach(k => { s[k] = !!s[k]; });

    // Registros: se descartan los dañados y los repetidos (mismo id).
    const vistos = new Set(), aportes = [];
    let malos = 0, repetidos = 0;
    for (const a of Array.isArray(o.aportes) ? o.aportes : []) {
      const x = limpiarAporte(a);
      if (!x) { malos++; continue; }
      if (vistos.has(x.id)) { repetidos++; continue; }
      vistos.add(x.id); aportes.push(x);
    }
    s.aportes = aportes;
    if (malos) avisos.push(`${malos} ${malos === 1 ? 'registro dañado se omitió' : 'registros dañados se omitieron'}`);
    if (repetidos) avisos.push(`${repetidos} ${repetidos === 1 ? 'registro repetido se omitió' : 'registros repetidos se omitieron'}`);
    s.favoritos = (Array.isArray(o.favoritos) ? o.favoritos : []).map(limpiarFavorito).filter(Boolean);
    s.favApts = [...new Set((Array.isArray(o.favApts) ? o.favApts : []).filter(x => typeof x === 'string'))];

    // Versión 1 → 2: dólares por defecto y etiquetas mensuales.
    if (versionOriginal < 2) {
      s.moneda = 'US';
      if (s.metaAptId || num(s.precio) !== PRECIO_TIPICO) s.metaElegida = true;
    }
    // Versión 2 → 3: el precio y el ahorro inicial guardan su propia moneda
    // (antes se guardaban en RD$ y cambiaban de valor en dólares al cambiar la tasa).
    if (versionOriginal < 3) {
      if (!('precioMon' in o)) s.precioMon = 'RD';
      if (!('saldoInicialMon' in o)) { s.saldoInicial = r2(num(s.saldoInicial) / s.tasa); s.saldoInicialMon = 'US'; }
      if (!('tasaHipoteca' in o)) s.tasaHipoteca = DEF.tasaHipoteca;
      if (!('plazoAnos' in o)) s.plazoAnos = DEF.plazoAnos;
    }
    if (!MONEDAS.includes(s.precioMon)) s.precioMon = 'RD';
    if (!MONEDAS.includes(s.saldoInicialMon)) s.saldoInicialMon = 'US';
    s.v = VERSION;
    return { s, avisos };
  }

  // La app de antes guardaba { inicio:'2026-11', real:{0:500,1:600}, ahorroActual } en dólares.
  function migrarViejo(o) {
    const s = clone(DEF);
    if (!esObj(o)) return s;
    const ini = /^\d{4}-\d{2}$/.test(o.inicio) ? o.inicio : '2026-11';
    const [y, m] = ini.split('-').map(Number);
    for (const k of Object.keys(o.real || {})) {
      const v = num(o.real[k]);
      if (!(v > 0)) continue;
      s.aportes.push({ id: uid(), fecha: isoLocal(new Date(y, m - 1 + Number(k), 15)), monto: r2(v), mon: 'US', tag: 'mes', nota: 'Pasado desde la versión anterior' });
    }
    s.saldoInicial = Math.max(0, r2(num(o.ahorroActual)));
    s.saldoInicialMon = 'US';
    s.onboarded = s.aportes.length > 0 || s.saldoInicial > 0;
    s.guiaOk = s.onboarded;
    return s;
  }

  // Revisa un archivo de respaldo antes de usarlo. No toca nada: solo dice si sirve.
  function leerRespaldo(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return { ok: false, error: 'El archivo está vacío.' };
    if (texto.length > 5e6) return { ok: false, error: 'El archivo es demasiado grande para ser un respaldo de la app.' };
    let o;
    try { o = JSON.parse(texto.replace(/^﻿/, '')); } catch (_) { return { ok: false, error: 'El archivo no se puede leer: no es un respaldo de la app (quizás es el historial CSV).' }; }
    if (!esObj(o)) return { ok: false, error: 'El archivo no tiene el formato de un respaldo.' };
    if (esObj(o.real) || 'ahorroActual' in o) {
      const s = migrarViejo(o);
      return { ok: true, s, avisos: ['Venía de la versión anterior de la app'], resumen: { registros: s.aportes.length } };
    }
    if (!Array.isArray(o.aportes)) return { ok: false, error: 'Al archivo le falta la lista de ahorros: no parece un respaldo de esta app.' };
    const { s, avisos } = normalizar(o);
    if (o.aportes.length && !s.aportes.length) return { ok: false, error: 'Ninguno de los registros del archivo es válido. No se importó nada.' };
    s.onboarded = true;
    return { ok: true, s, avisos, resumen: { registros: s.aportes.length } };
  }

  // Junta los ahorros por mes (los últimos `n` meses, del más viejo al más nuevo).
  function porMes(aportes, tasa, n, hoy) {
    hoy = hoy || new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1), ym = ymLocal(d);
      out.push({ ym, fecha: d, total: totalMes(aportes, ym, tasa) });
    }
    return out;
  }

  const Calc = {
    KEY, OLD_KEY, VERSION, PRECIO_TIPICO, TAGS, TAG_ALIAS, MONEDAS, DEF, LIMITE_MONTO,
    clone, num, clamp, r2, tagDe, isoLocal, ymLocal, fechaValida, ymd, mesesEntre,
    toRD, fromRD, convertir, simbolo, fmt, fmtExacto,
    precioRD, meta, montoRD, totalAportes, ahorrado, totalMes, progreso, pctTexto, hitos,
    promedioMensual, proyeccion, cuota, calcApt, porMes,
    uid, urlSegura, limpiarAporte, limpiarFavorito, normalizar, migrarViejo, leerRespaldo
  };
  if (typeof module === 'object' && module.exports) module.exports = Calc;
  else raiz.Calc = Calc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
