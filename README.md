# Mi apartamento en San Cristóbal

Plan de ahorro para comprar un apartamento en San Cristóbal (República Dominicana). Es una app web instalable que funciona sin conexión y guarda todo en el propio celular.

Abrir: https://jonnmy.github.io/apart/

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app: pantallas, estilos y eventos. |
| `calc.js` | Cálculos, fechas, validación de respaldos y migración de datos. No toca la pantalla, por eso se puede probar. |
| `sw.js` | Service worker: guarda la app y las letras para usarla sin internet. |
| `manifest.webmanifest`, `icon-*.png`, `favicon.svg` | Instalación en la pantalla de inicio. |
| `data/fuentes.json` | Lista de apartamentos hecha a mano (anuncios reales con su enlace). |
| `data/apartamentos.json` | Lista publicada. La genera `scripts/fetch-apartments.js` cada lunes. |
| `tests/calculos.test.js` | Pruebas de los cálculos. |

## Datos guardados

- Se guardan en `localStorage`, clave `apart_sc_v1`. Si existe la clave de la app anterior (`mi-apartamento-sc`), se pasa al formato nuevo sin borrarla.
- La versión actual del formato es la 3. Antes de pasar datos viejos a la versión nueva, se guarda una copia intacta en `apart_sc_v1_v1` o `apart_sc_v1_v2`.
- Si lo guardado está dañado, se aparta en `apart_sc_v1_danado_<fecha>` y no se pisa.
- Antes de importar un respaldo o de borrar todo, se guarda una copia automática en `apart_sc_v1_anterior`. Se puede recuperar desde Ajustes.
- Los montos de la meta (separación y mudanza) se guardan en pesos. El precio y el ahorro inicial guardan su propia moneda. Cada ahorro guarda su monto y su moneda. Cambiar entre US$ y RD$ solo cambia cómo se ven.

## Supuestos financieros (se pueden cambiar en Ajustes)

- Inicial: 20 % del precio.
- Gastos de cierre: 4 % del precio.
- Mudanza y separación: RD$50,000 cada una.
- Préstamo: 11.5 % anual a 20 años, con cuota fija (sistema francés). Es solo una estimación, no una oferta del banco.
- Tasa de cambio: RD$60.50 por US$1.
- Promedio mensual: cuenta desde el mes del primer ahorro. El mes en curso solo cuenta si ya tiene algún registro.
- Fecha estimada: suma el promedio (o el plan mensual) mes a mes hasta cubrir lo que falta.

## Probar

```
node --test tests/
```

GitHub Actions corre estas pruebas en cada cambio (`.github/workflows/pruebas.yml`).

Para ver la app en la computadora, sirve la carpeta con cualquier servidor estático bajo la ruta `/apart/`. Todas las rutas son relativas.
