# Mercado doméstico

Aplicación personal de precios y compras con guardado local y sincronización con MySQL.

## Ejecutar

En Windows, hacer doble clic en **iniciar.cmd** dentro de esta carpeta. Inicia Mercado, abre la página de la PC y configura el acceso privado por Tailscale en HTTPS 8443 si está conectado. La ventana muestra la dirección del teléfono; dejarla abierta y mantener la PC encendida para sincronizar. Ctrl+C detiene el servidor iniciado por esa ventana. Si Mercado ya está abierto, reutiliza ese servidor; tras actualizar el código, cerrar la ventana anterior y volver a iniciar. No reemplaza una configuración de otra aplicación en el puerto 8443.

En el teléfono, conectar Tailscale y abrir la dirección indicada. Abrir Mercado con conexión antes de salir para disponer de la página y el catálogo sin señal. MySQL y las dependencias de Python deben estar instalados. `python iniciar.py --check` comprueba el entorno sin iniciar ni configurar servicios.

Requiere Python 3.11+, MySQL 8.0.36 compatible y base `mercado` existente.

```powershell
python -m pip install -r requirements.txt
python migrate_foundation.py
python migrate_foundation.py --apply
python migrate_stock.py
python migrate_shopping.py
python -m uvicorn test:app --host 0.0.0.0 --port 8000
```

La migración 001 conserva tablas anteriores, respalda datos en `backups/` e importa compras históricas una sola vez. No crea una instalación vacía: para recuperar el modelo anterior consultar `docs/schema_actual.sql` y restaurar los datos del respaldo mediante un procedimiento revisado. No ejecutar los archivos SQL antiguos como instalación. Configuración actual de MySQL en `functions.py`; externalizar credenciales sigue pendiente.

Abrir `/home`. Para uso en teléfono se necesita HTTPS en una dirección estable que alcance la PC, porque service worker y generación segura de identificadores requieren contexto seguro. `localhost` funciona para pruebas en la propia PC. La configuración del acceso remoto/HTTPS no está incluida: una dirección privada de la PC normalmente solo es accesible dentro de la misma red. Mantener el mismo origen (protocolo, host y puerto): cambiarlo abre otro almacenamiento local.

## Uso sin conexión

1. Abrir una vez con conexión y esperar el catálogo; cerrar y abrir para que una actualización del service worker pendiente tome control.
2. Guardar productos y compras. La confirmación es de IndexedDB en el teléfono, no del servidor.
3. Consultar el número de pendientes y desplegar el detalle. Un producto nuevo se puede seleccionar y comprar antes de sincronizar.
4. La app reintenta al abrir, al volver a primer plano, al recuperar red y cada 30 segundos mientras está visible. También está el botón Sincronizar ahora. PC encendida y accesible es necesaria; no se depende de trabajo en segundo plano con la app cerrada.
5. Si se recibe un error de datos o conflicto, el registro sigue pendiente y el detalle muestra el motivo. Exportar pendientes permite conservar una copia; no modificar el UUID/payload de una operación que pudo haber sido confirmada. Crear correcciones de compras confirmadas se incorporará con el stock. No hay edición concurrente de catálogo en esta etapa.

El catálogo y la cola se guardan en `mercado_db`, versión 5. Se conservan los almacenes anteriores. El reemplazo del catálogo preserva productos/configuraciones pendientes. La cola solo elimina un elemento con recibo confirmado del mismo UUID. El servidor confirma recibo, compra y copia compatible anterior en una sola transacción; un reintento devuelve el recibo y un UUID reutilizado con otro payload devuelve 409.

No borrar datos del sitio ni usar navegación privada para compras pendientes. Se solicita almacenamiento persistente cuando el navegador lo permite; no garantiza protección ante borrado manual. Exportar pendientes genera JSON con catálogo, operaciones, stock y lista local. Recuperar respaldo del teléfono importa ese JSON conservando UUID y copias locales existentes. Los movimientos dependientes esperan confirmación de las operaciones anteriores.

## Cantidades y transición

La compra guarda cantidad decimal y total pagado, sin repetir filas por unidad. En Mi stock se confirma modalidad y unidad; las unidades históricas quedan pendientes hasta hacerlo. Envase fijo: cantidad de envases × contenido. Fraccionado: kg/litros y precio por kg/litro o importe total; para gramos/ml usar 1/1000. Por unidad: número de unidades. Ejemplo: 0,214 × $15.200 = $3.252,80 y entran 214 g. Las compras antiguas no generan stock; las nuevas lo suman cuando se marca Sumar al stock con unidades confirmadas.

Los envíos nuevos escriben ambos modelos para conservar consultas antiguas. Productos creados en pantallas anteriores se incorporan al catálogo al consultarlo; compras enviadas desde pantallas anteriores no se importan automáticamente al modelo nuevo. Se debe conciliar ese intervalo antes de retirar el sistema anterior.

## Comparación y formularios

El comparador toma precio de lista por envase y calcula el conjunto mínimo de la promoción: 2×1 paga uno, 3×2 paga dos, 4×3 paga tres, segunda al 50% paga 1,5 y 80% de descuento en la segunda paga 1,2. Conserva el total redondeado a centavos y deriva el precio medio a cuatro decimales. Por ejemplo 3×2 a $1000 guarda $2000, no $2000,0001.

En la compra se puede ingresar solo cantidad e importe total; el precio medio se calcula. Si se modifica precio/cantidad se limpia el total previo. Restar $0,01 es opcional. Comparar otra presentación no traslada sus valores al producto actual: hay que registrarla aparte. En fraccionados usar Compra, no promociones de envases. No comparar unidades físicas distintas.

El catálogo nuevo muestra fecha y antigüedad del último precio normal, con desempate por ID. Las vistas históricas de MySQL siguen disponibles y no se modificaron en este bloque. El modelo nuevo usa DECIMAL; las copias de compatibilidad conservan FLOAT, por lo que los importes exactos se consultan en purchase_lines.

## Verificación

`python tests_sync.py` verifica API/MySQL con registros propios temporales y los elimina al terminar. Comprueba dependencia, reintentos concurrentes, conflictos, decimales y fecha original.

`node tests_offline.cjs` verifica navegador real con Edge y Playwright; su ruta de dependencia corresponde al runtime local de Codex y debe adaptarse en otra PC. Usa servidor en 127.0.0.1:8765, contexto de navegador temporal y confirmaciones simuladas sin insertar sus compras en MySQL.

Plan y decisiones: `docs/PLAN_MEJORAS.md` y `docs/MODELO_DATOS.md`.

## Stock y lista del súper

Seleccionar producto en Mi stock y confirmar modalidad, unidad y contenido. Envase fijo de 500 g: dos paquetes representan 1000 g. Fraccionado usa referencia de 1000 g/ml; venta por unidad requiere unidad física unidad y contenido 1. Las unidades no se deducen automáticamente del nombre.

Cargar lo que hay en casa en g/kg, ml/litros o unidades, con ubicación y vencimiento opcionales. Cada carga o compra con entrada genera un lote. Seleccionar lote para consumir, descartar, abrir o ajustar; cantidades de movimiento en g/ml/unidades. Abrir no descuenta. Ajustar y revertir dejan historial; no se permiten negativos ni revertir dos veces. Revertir stock no cambia el importe de la compra.

Configurar mínimo en unidad base. La lista calcula faltantes y paquetes aproximados; excluye vencidos del stock utilizable. Un vencido permanece físicamente en stock hasta registrar descarte. Se marcan fechas dentro de siete días y fechas estimadas. Entradas manuales quedan en el dispositivo; mínimos, stock y movimientos sí se sincronizan. El usuario elige qué lote consumir.

La copia confirmada y efectos locales se guardan separados. Confirmar una operación no borra su efecto hasta descargar un snapshot con su recibo; después se reconcilian por ID. MySQL bloquea el lote para impedir consumos concurrentes que dejen negativos.

Productos con lotes conservan unidad/modalidad/contenido. Otra presentación requiere producto nuevo. Edición directa de vencimientos/ubicaciones y correcciones financieras de compras quedan pendientes; hay ajustes y reversos auditables de cantidades. Predicciones todavía no implementadas.

## Respaldos completos y recuperación

Respaldar base de la PC descarga estructura, registros, vistas y procedimientos; necesita conexión. Exportar pendientes conserva los datos del teléfono. Son complementarios.

```powershell
python database_backup.py
python database_backup.py --restore backups/full_FECHA.json --database mercado_recuperado
```

La recuperación exige una base NUEVA; rechaza la activa y cualquier destino existente. Valida conteos, valores y referencias. Un fallo de DDL puede dejar destino parcial; la activa no cambia. Para usar la recuperada revisar y cambiar DB_NAME en functions.py. Respaldar sin migraciones concurrentes.

Se verificó restauración en mercado_restore_check_20261001, conservada como base de ensayo. backups/ está excluido de Git. tests_stock.py verifica stock contra MySQL con datos temporales propios; tests_stock_offline.cjs verifica teléfono de 390px, vencidos, consumos, mínimos, importación repetida y reconexión.

## Códigos, fotos y recorrido

Abrir Códigos, fotos y recorrido del súper desde Productos. Escribir o escanear un código; si está registrado selecciona el producto, y si es desconocido precarga el código en el alta. Asociar códigos a productos existentes o guardar un código opcional con el nuevo producto. Cámara y lectura desde foto dependen de BarcodeDetector, HTTPS y permisos; si falta soporte se conserva entrada manual. Documentación: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector

Guardar una foto frontal como referencia del producto elegido. Buscar por foto propone referencias parecidas para revisión; funciona offline y no extrae automáticamente datos de envases desconocidos. Fotos de colores parecidos, mala iluminación o distinto encuadre pueden confundirse.

Crear/confirmar una sucursal con dirección. Registrar pasillos, estantes y exhibiciones de productos; múltiples ubicaciones están permitidas. Guardar un mapa con puntos de paso y conexiones transitables en metros. La lista se ordena por pasillo sin mapa; con mapa se calcula recorrido aproximado hasta cajas, con recogida de fríos al final si se activa. Rutas desconectadas se informan. Se requieren mínimos/faltantes para generar paradas; las necesidades manuales sin producto quedan separadas.

Configurar grupos de equivalencias para elegir alternativas de cada faltante. El cambio sirve al recorrido; revisar tamaño y cantidad al comprar. Códigos, fotos de referencia, mapas, ubicaciones, grupos y sucursales se guardan localmente y sincronizan. Elecciones de alternativas son locales.

Detalles y pendientes: docs/BLOQUE_5.md. Pruebas: `python tests_shopping.py` y `node tests_shopping_offline.cjs` (servidor en puerto 8765, dependencia Playwright local de Codex).

## Precios de góndola
Productos → Seleccionar → Registrar precio de góndola permite guardar precio de lista, supermercado/sucursal, fecha y promoción sin generar compras ni lotes. Guarda localmente y sincroniza por operación idempotente. Productos distingue Góndola y muestra el precio efectivo cuando hay promoción; Comparar recupera el precio de lista y la condición para no aplicar dos veces el descuento. Aplicar una vez python migrate_shelf_prices.py en otras instalaciones; hace respaldo previo. Verificación: tests_sync.py y tests_shelf_prices.cjs.

## Promoción especial
Comparar y Registrar precio de góndola admiten Promoción especial: cantidad entera de envases/unidades, total de la oferta y descripción hasta 500 caracteres. El precio por envase sale de total/cantidad; el precio de lista no se exige para esta modalidad. Comparar precarga cantidad, importe y descripción de una observación especial. Al continuar con una compra conserva el total exacto y la descripción. La descripción no se interpreta para hacer cálculos. En otras instalaciones aplicar python migrate_special_promotions.py (respaldo previo). Pruebas: tests_promotions.cjs, tests_shelf_prices.cjs y tests_sync.py.

## Carrito antes de comprar

Agregar al carrito guarda una selección en el dispositivo sin registrar gastos, precios de compra ni stock. Carrito permite quitar productos y ajustar unidades con botones + y −. El importe se recalcula sin edición manual; las promociones se ajustan por conjuntos completos. Los fraccionados conservan la cantidad agregada, expresada en kg o litros. El total es estimado hasta revisar el ticket. Cada línea conserva su local, promoción y destino de stock.

Confirmar compra registra todas las líneas y vacía el carrito en una transacción local; un error de validación conserva el carrito completo. La fecha de compra es la de confirmación. Los reintentos de sincronización conservan identificadores para evitar duplicados. El servidor sincroniza cada línea por separado, por lo que pueden quedar líneas pendientes de revisión. El carrito funciona sin conexión, se conserva al cerrar y se incluye en exportar/recuperar pendientes; es propio de cada dispositivo.

No requiere migración de MySQL. IndexedDB incorpora el almacén cart en la versión 5. Verificación: node tests_cart.cjs (navegador temporal y servidor simulado, sin escrituras en MySQL).
