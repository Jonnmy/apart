// Revisa cada enlace de data/fuentes.json y publica en data/apartamentos.json
// solo los anuncios que siguen activos. Lo corre GitHub Actions cada lunes.
// Uso local: node scripts/fetch-apartments.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FUENTES = path.join(ROOT, 'data', 'fuentes.json');
const SALIDA = path.join(ROOT, 'data', 'apartamentos.json');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Textos que los portales muestran cuando un anuncio ya no existe aunque respondan 200.
const PAGINA_MUERTA = /p[aá]gina no existe|anuncio no disponible|anuncio (ya )?no (est[aá] )?disponible|este anuncio (ha )?expir|no se encontr[oó]|page not found|listing (is )?no longer available/i;

const limpiar = p => decodeURIComponent(p).replace(/\/+$/, '').toLowerCase();

async function revisar(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'es-DO,es;q=0.9' } });
    const status = res.status;
    if (status === 404 || status === 410) return { estado: 'caido', motivo: `El portal responde ${status}` };
    if (status === 401 || status === 403 || status === 429 || status >= 500) {
      return { estado: 'bloqueado', motivo: `El portal no deja revisarlo automáticamente (${status})` };
    }
    if (status !== 200) return { estado: 'caido', motivo: `Respuesta inesperada ${status}` };

    // Si el portal redirige a una página "padre" (la portada o la lista), el anuncio ya no existe.
    const antes = new URL(url), despues = new URL(res.url);
    const pa = limpiar(antes.pathname), pd = limpiar(despues.pathname);
    if (pd !== pa && (pd === '' || pa.startsWith(pd + '/'))) {
      return { estado: 'caido', motivo: 'Redirige a la portada o a una lista: el anuncio ya no existe' };
    }
    const html = (await res.text()).slice(0, 400000);
    const titulo = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ''])[1];
    if (PAGINA_MUERTA.test(titulo) || PAGINA_MUERTA.test(html.slice(0, 60000).replace(/<script[\s\S]*?<\/script>/gi, ''))) {
      return { estado: 'caido', motivo: 'La página dice que el anuncio no existe' };
    }
    return { estado: 'ok' };
  } catch (e) {
    return { estado: 'bloqueado', motivo: 'No se pudo conectar: ' + (e.name === 'AbortError' ? 'tardó demasiado' : e.message) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const fuentes = JSON.parse(fs.readFileSync(FUENTES, 'utf8'));
  let anterior = {};
  try { anterior = JSON.parse(fs.readFileSync(SALIDA, 'utf8')); } catch (_) {}
  const previo = id => (anterior.apartamentos || []).find(a => a.id === id) || {};
  const ahora = new Date().toISOString();
  const cache = new Map();
  const revisarUna = url => { if (!cache.has(url)) cache.set(url, revisar(url)); return cache.get(url); };

  const apartamentos = [], descartados = [];
  for (const a of fuentes.apartamentos) {
    const r = await revisarUna(a.url);
    console.log(`${r.estado.padEnd(9)} ${a.id.padEnd(8)} ${r.motivo || ''}`);
    if (r.estado === 'caido') { descartados.push({ id: a.id, titulo: a.titulo, url: a.url, motivo: r.motivo }); continue; }
    const p = previo(a.id);
    apartamentos.push({
      ...a,
      verificado: r.estado === 'ok',
      revisadoEl: r.estado === 'ok' ? ahora : (p.revisadoEl || null),
      aviso: r.estado === 'ok' ? null : r.motivo,
    });
  }

  const busquedas = [];
  for (const b of fuentes.busquedas) {
    const r = await revisarUna(b.url);
    console.log(`${r.estado.padEnd(9)} busqueda ${b.id} ${r.motivo || ''}`);
    // Las búsquedas solo se quitan si el portal dice que no existen.
    if (r.estado !== 'caido') busquedas.push({ ...b, verificado: r.estado === 'ok' });
  }

  const salida = { updatedAt: ahora, total: apartamentos.length, apartamentos, busquedas, descartados };
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + '\n');

  // Copia dentro de index.html para que la app tenga la lista aunque no haya internet.
  const INDEX = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(INDEX, 'utf8');
  const copia = JSON.stringify({ updatedAt: salida.updatedAt, apartamentos, busquedas }).replace(/<\//g, '<\\/');
  const nuevo = html.replace(/\/\*FALLBACK\*\/[\s\S]*?\/\*FIN\*\//, () => `/*FALLBACK*/${copia}/*FIN*/`);
  if (nuevo !== html) fs.writeFileSync(INDEX, nuevo);
  console.log(`\n${apartamentos.length} apartamentos publicados, ${descartados.length} descartados.`);
}

main().catch(e => { console.error(e); process.exit(1); });
