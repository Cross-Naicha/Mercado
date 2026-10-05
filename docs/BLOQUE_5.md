# Bloque 5: asistencia de compras

Migración 003 aplicada el 2026-10-01 con respaldo previo `backups/full_20261001_114158_081821.json`. Agrega product_barcodes y shopping_documents; no modifica compras, productos ni stock existente. Los documentos tienen tipo, propietario, payload validado y revisión; las operaciones usan los mismos recibos idempotentes y transacciones que el resto de la aplicación.

## Funciones disponibles

- Código como texto, con ceros iniciales y unicidad. Cada producto puede tener varios. Búsqueda y asociaciones sin señal; una alta de producto con código confirma ambos atómicamente, localmente y en MySQL.
- Cámara o foto de código mediante BarcodeDetector cuando el navegador lo admite. Se consultan formatos soportados, se informa el fallback manual y se liberan los recursos al cerrar, cambiar de página u ocultar la app. Requiere contexto seguro y permiso. No se instaló una librería de decodificación alternativa ni se probó cámara física del teléfono.
- Fotos de referencia: recorte central, miniatura WebP y firma RGB 8×8. Sugerencias locales por distancia entre firmas, con elección explícita. No es un modelo semántico ni OCR: iluminación, encuadre y colores similares pueden causar fallos. No extrae nombre/marca/contenido de productos desconocidos. La búsqueda trabaja offline con referencias previamente guardadas y sincroniza sus miniaturas.
- Sucursales con nombre, dirección y revisión; etiquetas históricas quedan pendientes de confirmar. Compra admite branch_id opcional; el texto market se conserva para reportes antiguos.
- Varias ubicaciones por producto/sucursal, pasillo, orden, estante, referencia, punto del mapa, refrigeración y última confirmación. Edición con revisión; una ubicación puede estar en góndola habitual y exhibición alternativa.
- Grupos de productos equivalentes; el usuario elige alternativa de un faltante para el recorrido. No cambia existencias ni supone contenido/precio idénticos. Se advierte revisar presentación al comprar.
- Mapa: nodos con etiqueta y conexiones bidireccionales con distancia positiva. El editor usa líneas con nombres y separadores, no JSON. Se validan entrada/cajas, IDs y conexiones. Ubicaciones sin mapa se ordenan por pasillo.
- Recorrido: Dijkstra para tramos transitables y selección del siguiente producto más cercano. Heurística, no óptimo global. Se priorizan productos no fríos antes de fríos; se permite pasar antes por pasillos de fríos sin recogerlos. Se señalan nodos inaccesibles, falta de camino a cajas, productos sin ubicación y necesidades manuales.

## Persistencia y sincronización

IndexedDB v4 suma shopping_cache, shopping_effects y shopping_choices. Snapshot y efectos se leen/reconcilian atómicamente; un efecto persiste hasta descargar su recibo. La cola conserva dependencias de productos, sucursales, mapas y versiones previas. Un conflicto queda pendiente visible, sin sobrescritura silenciosa. Alternativas elegidas para el recorrido son preferencias locales. Los respaldos locales v4 incluyen estos almacenes; se admite recuperar v3 y v4 sin reemplazar copias existentes.

## Verificación y límites

tests_shopping.py: ceros iniciales, producto/código atómico, reintento, código duplicado, sucursal, mapa y revisiones, nodos inválidos y equivalencias; registros temporales eliminados al terminar.

tests_shopping_offline.cjs: navegador real a 390px, asociación offline, alta de sucursal/mapa/ubicación, recarga sin señal, código desconocido, sugerencia con referencia sintética, tramos transitables, fríos al final y nodos desconectados. No sustituye prueba de cámara/fotos reales de supermercado. Suites de comparación, stock y sincronización anteriores también verificadas.

Pendientes explícitos: HTTPS remoto; decodificador alternativo para navegadores sin BarcodeDetector; reconocimiento semántico/OCR de fotos desconocidas; editor gráfico del mapa y optimización global; reasignación/eliminación de códigos y documentos con historial. No se inventaron mapas, ubicaciones ni referencias de productos del usuario.
