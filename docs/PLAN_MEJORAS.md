# Plan de mejoras de Mercado

Fecha: 2026-10-01. Referencia persistente para continuar entre chats.

## Bloques acordados

1. Diagnóstico y diseño de datos: 3, 4, 19, 20, 38–42, 48. Diagnóstico realizado y migración aditiva 001 aplicada. Consultar MODELO_DATOS.md. Falta confirmar unidades por producto y sucursales; la aplicación todavía usa las tablas originales.
2. Guardado local y sincronización: 7, 8, 14, 15, 17, 40, 46. Implementado para altas de productos y compras: cola IndexedDB, recibos idempotentes, confirmaciones, reintentos y errores visibles. Ver README.md. Edición concurrente/correcciones y configuración HTTPS remota pendientes.
3. Comparación y formularios: 1, 2, 4–6, 11–13, 42. Implementado y probado: cinco promociones, total exacto independiente del precio medio, validaciones, selección/limpieza, última referencia con fecha y desempate, aritmética decimal local. Unidad física/modalidad de venta histórica todavía pendiente (19/55); vistas antiguas conservadas para compatibilidad.
4. Stock: 21–27, 39, 41, 43–45, 19/55. Implementado: modalidad/unidades, inventario inicial, lotes, compras con entrada, consumo/descarte/apertura/ajustes/reversos, vencimientos, mínimos/lista y respaldos recuperables. Edición directa de metadatos de lotes y corrección de importes de compras quedan como ampliaciones del 26.
5. Asistencia de compras: 33–37, 47–54. Implementado: códigos de barras, escaneo nativo donde esté disponible, búsqueda offline, fotos por parecido con referencias, equivalencias, sucursales, múltiples ubicaciones, mapas de conexiones y recorridos aproximados con fríos al final. El punto 36 sigue parcial: extracción de datos de fotos desconocidas/IA semántica pendiente. Ver README.md y docs/BLOQUE_5.md.
6. Predicciones: 28–32. Pendiente; requiere historial suficiente.

Integrar 9, 10, 16 y 18 donde corresponda. Trabajar por etapas acotadas al presupuesto del usuario. No asumir que diagnóstico equivale a implementación.

## Lista numerada completa

1. Corregir promociones 3×2 y 4×3.
2. Corregir navegación al seleccionar producto.
3. Alinear SQL con la base real.
4. Definir cantidad y precio de promociones.
5. Corregir cantidades fraccionarias.
6. Validar datos y selección.
7. Manejar errores y confirmación de guardado.
8. Cerrar conexiones y quitar conexión inicial sin uso.
9. Externalizar credenciales.
10. Filtrar búsqueda localmente.
11. Renderizar textos sin romper botones ni interpretar HTML.
12. Calcular antigüedad y desempatar últimos precios.
13. Reiniciar selección y promociones correctamente.
14. Confirmar transacciones locales y manejar errores.
15. Guardar altas sin conexión y sincronizar pendientes.
16. Actualizar y limpiar caché de la aplicación.
17. Documentar instalación, dependencias y esquema.
18. Ordenar nombres, código sin uso y depuración.
19. Definir unidades y productos abiertos.
20. Separar observación de precio y compra.
21. Cargar stock inicial.
22. Registrar compras, consumos, descartes y ajustes.
23. Gestionar lotes y vencimientos.
24. Consultar existencias y próximos vencimientos.
25. Generar lista del súper con mínimos y entradas manuales.
26. Corregir registros conservando historial.
27. Exportar y recuperar respaldos.
28. Medir consumo semanal separado de descartes.
29. Estimar fecha de agotamiento.
30. Considerar vencimientos al recomendar compras y consumo.
31. Incorporar estacionalidad.
32. Evaluar predicciones frente a resultados reales.
33. Asociar códigos de barras como texto.
34. Escanear códigos conocidos con cámara.
35. Facilitar altas de códigos desconocidos.
36. Sugerir datos desde imágenes con revisión del usuario.
37. Escanear y registrar sin conexión.
38. Separar producto, precio, compra y movimiento de stock.
39. Conservar fecha del evento y de sincronización.
40. Identidades estables y envíos sin duplicados.
41. Separar paquetes y contenido por paquete.
42. Usar precisión decimal para dinero.
43. Ubicaciones domésticas: despensa, heladera, freezer.
44. Facilitar registro de apertura, consumo y descarte.
45. Distinguir datos exactos, estimados e inferidos.
46. Resolver correcciones y conflictos de sincronización.
47. Agrupar productos equivalentes.
48. Identificar sucursales de supermercados.
49. Ubicaciones de productos por sucursal, incluyendo varias exhibiciones.
50. Mapas con entrada, cajas, pasillos y conexiones.
51. Ordenar lista por pasillo y luego calcular recorridos.
52. Restricciones de recorrido, por ejemplo congelados al final.
53. Corregir ubicaciones y registrar última confirmación.
54. Guardar mapas y recorridos sin conexión.
55. Modalidad de venta: envase fijo, fraccionado o unidad; separar peso de compra de presentación y permitir precio por kg/litro o importe total.

## Avance adicional del bloque 2

Se corrigieron 1 y 2 para no trasladar promociones incorrectas ni bloquear la selección de productos a las compras sin señal. También se resolvieron búsqueda local (10), renderizado seguro (11), limpieza de promociones (parte de 13), cantidad fraccionaria sin bucle (5) y renovación de caché (16). Bloque 3 conserva revisión integral de formularios y promociones; no asumirlo completo.

## Cierre del bloque 3

main.js conserva estado, cálculos y formularios; se retiraron las antiguas implementaciones duplicadas de fetch/IndexedDB/envíos. offline.js mantiene persistencia y sincronización. Los importes se calculan con enteros escalados, y total_paid conserva el importe del ticket aunque el precio medio sea periódico. La API acepta operaciones viejas sin total_paid. Al editar cantidad o precio se descarta el total previo para evitar reutilizar una oferta. Comparar otra presentación no modifica la compra seleccionada.

Verificación del bloque 3: tests_forms.cjs, tests_offline.cjs y tests_sync.py.

## Bloque 4

Migración aditiva 002 aplicada con respaldo completo previo. Stock inicial vacío; las compras históricas se conservan sin generar existencias. Unidades de cada producto se confirman en pantalla sin inferirlas por nombre. Contenido normalizado g/ml/unidad; compras fraccionadas se ingresan por kg/litro y se convierten a unidad base. Compra, lote, movimiento y recibo se confirman en la misma transacción.

La cola y efectos locales sobreviven a recargas; los recibos confirmados se reconcilian junto con el snapshot de stock, evitando pérdida/doble conteo entre confirmación y descarga. Conflictos de consumo se muestran y se conservan pendientes. No se eliminan registros confirmados para corregir stock.

Pruebas: tests_stock.py (incluye concurrencia, fraccionado, unidad inmutable y reversos), tests_stock_offline.cjs (teléfono 390px, vencidos, faltantes, compras, consumo, importación repetida, reconexión), suites anteriores. Respaldo completo restaurado en base separada mercado_restore_check_20261001 con conteos/valores/referencias verificados; base activa intacta. Lista manual solo local; mínimos y existencias sincronizados.

## Navegación y edición de productos
Productos ofrece un menú de acciones al seleccionar: comparar, comprar, agregar existencias o registrar consumo/descarte. La configuración de modalidad, unidad y contenido se edita junto con los datos descriptivos en Productos. Una operación product_edit confirma ambos en una transacción y una revisión; las operaciones anteriores siguen siendo compatibles. Los productos con lotes bloquean los cambios de presentación. El descuento filtra lotes del producto elegido con saldo positivo. Verificación: tests_sync.py, tests_stock.py, tests_product_edit.cjs y tests_tabs.cjs.
