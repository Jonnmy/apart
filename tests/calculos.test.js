// Pruebas de los cálculos. Correr con:  node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const base = extra => Object.assign(C.clone(C.DEF), extra || {});
const cerca = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) <= d, `${a} ≠ ${b}`);

test('conversión US$ ↔ RD$ es reversible y usa la tasa', () => {
  assert.equal(C.toRD(100, 'US', 60.5), 6050);
  assert.equal(C.toRD(100, 'RD', 60.5), 100);
  cerca(C.fromRD(6050, 'US', 60.5), 100);
  cerca(C.convertir(1234.56, 'US', 'RD', 59.75) / 59.75, 1234.56);
  // Tasa inválida: usa la de por defecto en vez de dividir entre cero
  assert.equal(C.fromRD(605, 'US', 0), 10);
  assert.equal(C.toRD('1,000', 'US', 60), 60000);
});

test('formato de montos', () => {
  assert.equal(C.fmt(1234.4, 'US'), 'US$1,234');
  assert.equal(C.fmt(-0.3, 'US'), 'US$0');
  assert.equal(C.fmt(-12, 'RD'), '−RD$12');
  assert.equal(C.fmtExacto(1100, 'US'), 'US$1,100');
  assert.equal(C.fmtExacto(99.5, 'US'), 'US$99.50');
});

test('meta: inicial + gastos de cierre + mudanza', () => {
  const m = C.meta(base({ precio: 5000000, precioMon: 'RD', inicialPct: 20, gastosPct: 4, mudanza: 50000 }));
  assert.equal(m.inicial, 1000000);
  assert.equal(m.gastos, 200000);
  assert.equal(m.total, 1250000);
  // Precio en dólares: se convierte con la tasa actual
  const u = C.meta(base({ precio: 100000, precioMon: 'US', tasa: 60, inicialPct: 10, gastosPct: 0, mudanza: 0 }));
  assert.equal(u.total, 600000);
});

test('cambiar la moneda de vista no cambia lo guardado', () => {
  const s = base({ precio: 90000, precioMon: 'US', saldoInicial: 2500, saldoInicialMon: 'US', tasa: 60 });
  const antes = JSON.stringify(s);
  s.moneda = 'RD'; C.progreso(s); s.moneda = 'US'; C.progreso(s);
  s.moneda = 'RD';
  const t = JSON.parse(antes); t.moneda = 'RD';
  assert.deepEqual(s, t);
  // El ahorro inicial en dólares sigue valiendo lo mismo en dólares aunque cambie la tasa
  const a1 = C.fromRD(C.ahorrado(s), 'US', 60);
  s.tasa = 62;
  cerca(C.fromRD(C.ahorrado(s), 'US', 62), a1);
});

test('progreso: porcentaje y lo que falta, sin pasarse de 100%', () => {
  const s = base({ precio: 1000000, precioMon: 'RD', inicialPct: 20, gastosPct: 0, mudanza: 0, saldoInicial: 0 });
  s.aportes = [{ id: 'a', fecha: '2026-01-10', monto: 50000, mon: 'RD', tag: 'mes' }];
  let p = C.progreso(s);
  assert.equal(p.pct, .25); assert.equal(p.falta, 150000); assert.equal(p.faltaInicial, 150000);
  s.aportes.push({ id: 'b', fecha: '2026-02-10', monto: 999999, mon: 'RD', tag: 'mes' });
  p = C.progreso(s);
  assert.equal(p.pct, 1); assert.equal(p.falta, 0);
  assert.equal(C.pctTexto(.996), 99);
  assert.equal(C.pctTexto(1), 100);
  // Meta en cero no rompe nada
  const z = C.progreso(base({ precio: 0, mudanza: 0 }));
  assert.equal(z.pct, 0); assert.equal(z.falta, 0);
});

test('cuota del préstamo (sistema francés)', () => {
  // 4,000,000 al 11.5% a 20 años ≈ 42,657 al mes
  cerca(C.cuota(4000000, 11.5, 20), 42657.4, 1);
  assert.equal(C.cuota(1200, 0, 1), 100);
  assert.equal(C.cuota(0, 11.5, 20), 0);
  assert.equal(C.cuota(1000, 10, 0), 0);
});

test('promedio mensual no castiga el mes en curso sin registros', () => {
  const hoy = new Date(2026, 10, 3); // 3 de noviembre
  const ap = [
    { fecha: '2026-09-05', monto: 1000, mon: 'US' },
    { fecha: '2026-10-05', monto: 1000, mon: 'US' }
  ];
  cerca(C.promedioMensual(ap, 1, hoy), 1000); // sep + oct = 2 meses
  ap.push({ fecha: '2026-11-02', monto: 500, mon: 'US' });
  cerca(C.promedioMensual(ap, 1, hoy), 2500 / 3);
  assert.equal(C.promedioMensual([], 60, hoy), 0);
  // Registros con fecha futura no cuentan
  cerca(C.promedioMensual([{ fecha: '2027-01-01', monto: 9, mon: 'US' }], 1, hoy), 0);
});

test('proyección de meses hasta la meta', () => {
  const hoy = new Date(2026, 10, 25);
  let r = C.proyeccion(3000, 1000, { hoy });
  assert.equal(r.meses, 3); assert.equal(r.fecha.getMonth(), 1); // dic, ene, feb → febrero
  r = C.proyeccion(3000, 1000, { hoy, empiezaEsteMes: true });
  assert.equal(r.meses, 3); assert.equal(r.fecha.getMonth(), 0); // nov, dic, ene → enero
  assert.equal(C.proyeccion(0, 1000, { hoy }).meses, 0);
  assert.equal(C.proyeccion(5000, 0, { hoy }).meses, Infinity);
  // Extra cada diciembre
  r = C.proyeccion(3000, 1000, { hoy, extra: 1000, anual: true });
  assert.equal(r.meses, 2);
  // Extra una sola vez sin ahorro mensual: alcanza o no alcanza
  assert.equal(C.proyeccion(500, 0, { hoy, extra: 600 }).meses, 1);
  assert.equal(C.proyeccion(5000, 0, { hoy, extra: 600 }).meses, Infinity);
  // Valores extremos
  assert.equal(C.proyeccion(1e12, 1, { hoy }).meses, Infinity);
  assert.equal(C.proyeccion(100, -50, { hoy }).meses, Infinity);
});

test('fechas en hora local, sin corrimientos de día', () => {
  assert.equal(C.isoLocal(new Date(2026, 0, 31, 23, 59)), '2026-01-31');
  assert.equal(C.isoLocal(new Date(2026, 2, 1, 0, 0)), '2026-03-01');
  assert.ok(C.fechaValida('2026-02-28'));
  assert.ok(!C.fechaValida('2026-02-30'));
  assert.ok(!C.fechaValida('26-2-1'));
  const v = C.migrarViejo({ inicio: '2026-01', real: { 0: 500, 1: 600, 2: 0 }, ahorroActual: 300 });
  assert.deepEqual(v.aportes.map(a => a.fecha), ['2026-01-15', '2026-02-15']);
  assert.equal(v.saldoInicial, 300); assert.equal(v.saldoInicialMon, 'US');
});

test('hitos ordenados y sin etapas vacías', () => {
  const h = C.hitos(base({ precio: 1000000, precioMon: 'RD', reserva: 50000, inicialPct: 20, gastosPct: 4, mudanza: 50000 }));
  assert.deepEqual(h.map(x => x.k), ['reserva', 'i25', 'i50', 'i100', 'total']);
  assert.ok(h.every((x, i) => i === 0 || x.v >= h[i - 1].v));
  assert.equal(C.hitos(base({ precio: 0, mudanza: 0, reserva: 0 })).length, 0);
});

test('migración de la versión 2 conserva los datos', () => {
  const v2 = { v: 2, onboarded: true, moneda: 'US', tasa: 60.5, precio: 5025000, saldoInicial: 151250, metaAptId: 'pal3', metaElegida: true,
    aportes: [{ id: 'x1', fecha: '2026-10-05', monto: 1000, mon: 'US', tag: 'quincena', nota: 'hola' }], favoritos: [], favApts: ['pal3'] };
  const { s, avisos } = C.normalizar(v2);
  assert.equal(s.v, 3);
  assert.equal(s.precioMon, 'RD'); assert.equal(s.precio, 5025000);
  assert.equal(s.saldoInicialMon, 'US'); assert.equal(s.saldoInicial, 2500);
  assert.equal(s.aportes[0].tag, 'mes'); assert.equal(s.aportes[0].nota, 'hola');
  assert.deepEqual(s.favApts, ['pal3']);
  assert.deepEqual(avisos, []);
  // Normalizar dos veces da lo mismo (no se convierte otra vez)
  assert.deepEqual(C.normalizar(s).s, s);
});

test('versión 1 pasa a dólares y marca la meta', () => {
  const { s } = C.normalizar({ onboarded: true, moneda: 'RD', precio: 5000000, aportes: [] });
  assert.equal(s.moneda, 'US'); assert.equal(s.metaElegida, true);
});

test('respaldos: acepta los buenos y rechaza los dañados', () => {
  const bueno = JSON.stringify({ v: 3, nombre: 'Valery', aportes: [
    { id: 'a', fecha: '2026-10-01', monto: 900, mon: 'US', tag: 'mes' },
    { id: 'a', fecha: '2026-10-01', monto: 900, mon: 'US', tag: 'mes' },
    { id: 'b', fecha: 'ayer', monto: 50, mon: 'US' },
    { id: 'c', fecha: '2026-10-02', monto: -5, mon: 'US' }
  ], favoritos: [{ titulo: 'x', url: 'javascript:alert(1)' }, { titulo: 'y', url: 'https://ejemplo.com/a' }] });
  const r = C.leerRespaldo('﻿' + bueno);
  assert.ok(r.ok);
  assert.equal(r.s.aportes.length, 1);
  assert.equal(r.s.favoritos.length, 1);
  assert.equal(r.avisos.length, 2);
  assert.ok(!C.leerRespaldo('').ok);
  assert.ok(!C.leerRespaldo('Fecha;Monto\n2026-01-01;5').ok);
  assert.ok(!C.leerRespaldo('[1,2]').ok);
  assert.ok(!C.leerRespaldo('{"hola":1}').ok);
  assert.ok(!C.leerRespaldo(JSON.stringify({ aportes: [{ monto: 'x' }] })).ok);
  const viejo = C.leerRespaldo(JSON.stringify({ inicio: '2026-11', real: { 0: 700 } }));
  assert.ok(viejo.ok); assert.equal(viejo.s.aportes.length, 1);
});

test('números fuera de rango se corrigen', () => {
  const { s } = C.normalizar({ v: 3, tasa: -4, inicialPct: 300, gastosPct: 'abc', plazoAnos: 0, aportes: [] });
  assert.equal(s.tasa, C.DEF.tasa); assert.equal(s.inicialPct, 100); assert.equal(s.gastosPct, 0); assert.equal(s.plazoAnos, 1);
});

test('apartamento: inicial, lo que falta y cuota', () => {
  const s = base({ inicialPct: 20, gastosPct: 4, mudanza: 50000, saldoInicial: 0, tasaHipoteca: 11.5, plazoAnos: 20 });
  s.aportes = [{ id: 'a', fecha: '2026-10-01', monto: 500000, mon: 'RD' }];
  const c = C.calcApt(s, 5000000);
  assert.equal(c.ini, 1000000); assert.equal(c.faltaIni, 500000); assert.equal(c.pct, .5);
  assert.equal(c.total, 1250000);
  cerca(c.cuota, C.cuota(4000000, 11.5, 20));
});

test('ahorros por mes', () => {
  const hoy = new Date(2026, 10, 25);
  const m = C.porMes([{ fecha: '2026-11-01', monto: 10, mon: 'US' }, { fecha: '2026-09-30', monto: 5, mon: 'US' }], 1, 3, hoy);
  assert.deepEqual(m.map(x => [x.ym, x.total]), [['2026-09', 5], ['2026-10', 0], ['2026-11', 10]]);
});
