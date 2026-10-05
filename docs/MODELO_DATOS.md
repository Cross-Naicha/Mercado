# Bloque 1: diagnóstico y propuesta de datos

## Evidencia de la base real

Consulta de solo lectura realizada el 2026-10-01. MySQL 8.0.36: 35 productos y 59 instancias; dos tablas, cinco vistas y tres procedimientos. Estructura completa en schema_actual.sql; inventario en database_inventory.json. inspect_database.py permite repetir la extracción sin copiar registros personales ni modificar MySQL. La extracción de estructura no es un respaldo de datos ni un archivo de migración.

La base real contiene quantity y acepta cinco parámetros en create_instance. v_last_prices contiene product_all, product_class y los campos separados del producto que espera JavaScript. Los tres archivos de sql/ son versiones antiguas: no deben usarse para reconstruir la instalación actual.

Las vistas rv_tickets, v_tickets y v_facturas calculan gastos: price × quantity. Esto sugiere que price representa precio por unidad de compra y quantity su multiplicador; no demuestra que todos los registros históricos representen compras. El formulario repite filas para cantidades enteras. No hay vínculos de clave foránea entre las tablas.

Otros hallazgos: dinero y cantidades usan FLOAT; presentation no indica unidad; fechas solo guardan el día del servidor; últimos precios no desempatan por ID; la resta de fechas no mide días correctamente; FORMAT convierte presentación a texto; pclass existe pero el procedimiento de alta no lo recibe. No hay esquema completo versionado ni control de migraciones.

## Contrato propuesto

Separar estas entidades, implementándolas por etapas:

| Entidad | Datos y propósito |
| --- | --- |
| Producto | UUID estable, ID antiguo opcional, nombre, marca, categoría, variantes, contenido por envase y unidad explícita. Cada presentación comercial es un producto distinto. |
| Código de barras | Código de texto asociado a producto; varios por producto. Código único dentro del catálogo local. |
| Sucursal | UUID, cadena/nombre y dirección o referencia del local. No unir locales solo por nombre de cadena. |
| Precio observado | UUID, producto, sucursal opcional, cantidad cubierta, importe total, moneda, promoción y fecha real. No cambia stock. |
| Compra | UUID, sucursal opcional y fecha; líneas con producto, cantidad adquirida e importe total efectivamente pagado. Puede generar referencia de precio y entrada de stock. |
| Movimiento de stock | UUID, producto/lote, cantidad con signo, unidad, motivo y fecha. Referencia a línea de compra cuando corresponda. Stock = suma de movimientos. |
| Lote | Producto, compra de origen, ubicación doméstica y vencimiento opcional con origen exacto/estimado. Se incorpora en bloque 4. |

Los mínimos de compra, equivalencias, mapas, ubicación por producto/sucursal y fotos serán entidades separadas posteriores. No agregar ahora columnas de predicción o mapas sin uso.

### Cantidades y dinero

Contenido: DECIMAL(18,6), mayor que cero, en g, ml o unidad. Cantidad de envases adquiridos: DECIMAL(18,6); fracciones permitidas donde tengan sentido. Stock y movimientos se expresan en la unidad base del producto. Dos paquetes de 500 g generan una entrada de 1000 g. Apertura no reduce stock por sí misma; consumo y descarte sí.

Dinero: DECIMAL(18,4) y moneda explícita (inicialmente ARS). API y almacenamiento local intercambian decimales como cadenas para preservar precisión; presentación en pantalla a dos decimales, redondeando al final. No convertir kg/l a g/ml históricos sin confirmar qué significaba la presentación de cada producto.

Precio canónico: importe total por cantidad cubierta. Una oferta 3×2 de envases a $1000 cubre 3 envases por $2000; precio por envase = 2000/3. Una compra de seis envases a esa oferta tiene cantidad 6 e importe total $4000. Mantener precio de lista y descripción de promoción opcionales. Observación y compra pueden vincularse sin sumar stock dos veces.

### Identidad, tiempo y sincronización

UUID generado en el teléfono para cada entidad y operación, incluso sin conexión. IDs antiguos se conservan en un mapeo para migración. Una compra nueva puede referenciar el UUID de un producto todavía pendiente.

Guardar occurred_at (instante del evento en UTC), zona/offset original y received_at (recepción del servidor). Para registros antiguos conservar la fecha sin inventar una hora exacta. Vencimiento es una fecha local, no un instante UTC.

Cada operación local se guarda atómicamente junto con su entrada en la cola: operation_id, entidad, tipo, payload, estado, intentos, error y versión esperada. El servidor aplica operación y registra recibo en una sola transacción. UUID de operación único: un reintento devuelve el recibo anterior; un payload distinto con el mismo UUID se rechaza. Confirmar primero producto/sucursal y después dependencias.

Productos y sucursales editables llevan versión; cambios sobre una versión antigua producen conflicto visible sin sobrescribir silenciosamente. Compras/movimientos confirmados se corrigen mediante reversos o ajustes vinculados. Eliminar usa una marca persistente para propagar la eliminación. Sincronizar al abrir/volver a la app, con conexión utilizable y botón manual; no depender de ejecución permanente en segundo plano.

Restricciones previstas: claves foráneas, unicidad de UUID y operation_id, índices por producto/fecha y sucursal, cantidades positivas en compras y precios, importes no negativos, movimientos con signo coherente con el motivo. Productos con existencias no se eliminan físicamente.

## Propuesta de migración por etapas

1. Respaldar estructura Y datos y verificar restauración en una base de prueba. Captura actual de estructura ya disponible; respaldo de registros pendiente.
2. Crear migraciones versionadas y tablas nuevas junto a las existentes, sin alterar el comportamiento actual. Primero productos, sucursales, observaciones, compras/líneas y recibos de sincronización; stock/lotes se incorporan en bloque 4.
3. Asignar UUID estables a productos existentes y conservar id_product. Revisar presentación/unidad; las desconocidas quedan explícitamente sin confirmar y no participan en comparaciones incompatibles.
4. Importar nombres de comercios como sucursales provisionales, conservando texto original. Revisar duplicados y locales antes de unirlos.
5. Conservar cada instancia y su ID de origen. Clasificar inicialmente como registro histórico de tipo no confirmado. No convertir las 59 filas en stock actual ni presumir compras: podría haberse consumido todo o ser observaciones. Conservar price y quantity originales para auditoría y reconciliar gastos con vistas existentes.
6. Revisar precios/promociones ambiguos y cantidades históricas. Convertir a decimal de forma explícita, documentando redondeos; no recrear una exactitud que FLOAT ya perdió. Una vez confirmado el significado, derivar observación o compra con enlace al origen.
7. Agregar API nueva y cola local; mantener endpoints actuales durante transición. Confirmar persistencia, reintentos, dependencia de producto nuevo y reinicio del navegador.
8. Cambiar pantalla al contrato nuevo y verificar equivalencia de catálogo/gastos. Para iniciar stock realizar inventario físico o una fecha de corte explícita.
9. Retirar estructura antigua solo después de validación y respaldo. Revertir la pantalla/API al sistema anterior si falla la transición; reconciliar operaciones nuevas antes de cualquier restauración para no perderlas.

## Criterios de cierre y pendientes

### Actualización: bloque 5

Migración 003: product_barcodes (código de texto único y producto con FK), shopping_documents (mapa, ubicación, equivalencias y referencias fotográficas), con payload validado y revisión. Sucursales existentes admiten dirección/confirmación y compra puede referenciar branch_id. No se fusionaron etiquetas históricas ni se inventaron direcciones.

IndexedDB v4 agrega shopping_cache/effects/choices y respaldos locales v4, compatibles con recuperación v3. Códigos, referencias, ubicaciones, grupos y mapas se sincronizan usando recibos y dependencias. Alta de producto con código se confirma atómicamente. Conflictos de revisión quedan visibles.

Recorrido aproximado por conexiones bidireccionales con distancia, tramos Dijkstra y siguiente parada cercana; fríos se recogen al final y desconectados se informan. Fotos proponen parecido a referencias locales, no reconocimiento semántico de productos desconocidos. Detalles y pruebas en BLOQUE_5.md.

### Actualización: bloque 4 y migración 002

Se agregó sale_mode a catalog_products y tablas stock_lots, stock_movements y stock_preferences. La modalidad y unidad se confirman por producto sin inferirlas de sus nombres. Compras nuevas con add_to_stock crean lote/movimiento dentro de la transacción del recibo; compras históricas no generan stock. Para fraccionados las líneas nuevas guardan cantidad en g/ml y el precio compatible anterior sigue por kg/litro.

Stock es suma de movimientos por lote. Consumir/descarte restan; abrir no resta; ajustes y reversos conservan historial. Bloqueo de lote y lectura actual de movimientos impiden negativos con consumos concurrentes. Unidades/contenido de productos con lotes son inmutables. Mínimos usan revisión para conflictos de edición. Vencimientos son fechas locales con origen exacto/estimado.

IndexedDB v3 tiene stock_cache, stock_effects y shopping_manual además de catálogo/cola. Copia y efectos se leen/reconcilian en transacciones conjuntas. Un efecto confirmado permanece hasta que el snapshot contiene su recibo, evitando el hueco entre confirmación y descarga. Dependencias incluyen altas, configuraciones y movimientos anteriores del mismo lote. Lista manual local; mínimos y movimientos sincronizados.

Respaldo previo: backups/full_20261001_111846_023432.json. Respaldo posterior y ensayo de recuperación: backups/full_20261001_113049_332229.json, restaurado en mercado_restore_check_20261001. Se verificaron conteos, valores y referencias en destino separado; base activa sin cambios. database_backup.py permite exportación y restauración solo en base nueva. La pantalla permite recuperar respaldos locales conservando UUID.

Edición directa de metadatos de lotes y correcciones financieras quedan pendientes; correcciones de stock mediante ajustes/reversos ya disponibles. Acceso HTTPS remoto todavía pendiente.

### Actualización: bloque 2

La pantalla nueva usa /api/catalog y /api/sync. Productos y compras se guardan primero en IndexedDB con UUID; el servidor escribe ambos modelos y el recibo dentro de la misma transacción. Conserva instante UTC, zona original y fecha local de compra. Las altas nuevas ya no quedan exclusivamente en el modelo anterior. Pantallas antiguas todavía pueden generar compras que requieren conciliación posterior. El catálogo importa productos antiguos faltantes al consultarse.

Se verificaron reintentos concurrentes, dependencia de producto, conflicto por UUID reutilizado, cantidad decimal y fecha local. En navegador real se verificaron carga sin señal, recarga offline, pérdida de respuesta y falla de almacenamiento sin borrar formulario. Acceso desde teléfono requiere configurar origen HTTPS estable y conectividad con la PC; esa configuración no fue realizada. Stock y modalidad explícita del punto 55 siguen pendientes.

### Actualización: migración 001 aplicada

El usuario autorizó reformular MySQL, indicó que las instancias eran compras y confirmó que presentation estaba en kilos, litros o número de unidades según el producto. No existe una columna de unidad física en la base anterior: normal_unit es precio dividido por presentación y quantity es cantidad adquirida.

Se ejecutó migrate_foundation.py --apply con sql/001_foundation.sql. Nuevas tablas: schema_migrations, catalog_products, store_branches, purchases, purchase_lines, price_observations y sync_receipts. Se conservaron las tablas, vistas, procedimientos y datos originales. La aplicación continúa usando el modelo anterior; este es el fundamento para la próxima etapa, no una sincronización implementada.

Importación: 35 productos, 59 compras y 59 líneas, con UUID deterministas y enlaces a sus IDs originales. Una instancia equivale a una compra histórica independiente: no se inventaron tickets agrupando por fecha. Todas quedan marcadas para revisión de unidades/promociones, con precisión temporal de día y sin hora inventada. Las unidades físicas y contenido normalizado quedan pendientes; se conserva legacy_presentation. No se generó stock.

Se importaron cuatro etiquetas de comercio como sucursales provisionales, sin ubicación confirmada. Las diferencias de escritura no se fusionan automáticamente: deben revisarse antes de asignar locales reales.

Respaldo local: backups/20261001_101449_637304/legacy_data.json y legacy_schema.sql, más huella SHA256. Archivo de datos leído y comparado con su serialización antes del DDL. No se ensayó restauración completa en otra base; las tablas originales permanecen disponibles. backups/ está excluido de Git para no publicar compras personales.

Verificación realizada: tablas originales idénticas antes/después durante la transacción; 35 productos y 59 líneas importadas; total histórico 174718,6000 ARS, consistente con v_tickets a precisión de centavos; sin diferencias por fecha/comercio; vista original devuelve 35 productos. Segunda ejecución de --apply no modifica datos ni duplica registros.

El script valida referencias, cantidades, precios y promociones antes de escribir. MySQL confirma DDL por separado; si falla la importación, sus datos y marca de versión se revierten y las tablas nuevas vacías pueden quedar para reintentar. No hay herramienta automática de restauración ni política de convivencia para altas posteriores aún: las nuevas altas de la pantalla solo entran al modelo anterior hasta adaptar la API. Antes de activar el modelo nuevo se debe reconciliar ese intervalo.

Diagnóstico y migración inicial del bloque 1 completados; aplicación y datos originales sin cambios. Pendiente confirmar unidad individual de cada producto, validar promociones históricas e identificar sucursales físicas. La interpretación de instancias como compras y la convención variable de presentación ya fueron confirmadas por el usuario.

Pendiente para próximas migraciones: probar restauración en copia, resolver unidades y conciliar altas posteriores antes de cambiar la API. Las escrituras realizadas en MySQL corresponden exclusivamente a la migración aditiva 001.
