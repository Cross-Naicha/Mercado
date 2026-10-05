"""Exporta estructura y conteos de Mercado sin modificar la base ni copiar compras."""
import json
from pathlib import Path

import functions


def main():
    cursor, connection = functions.connect_to_database()
    try:
        cursor.execute("SELECT VERSION()")
        version = cursor.fetchone()[0]
        cursor.execute("SHOW FULL TABLES")
        objects = cursor.fetchall()
        definitions = []
        counts = {}
        for name, kind in objects:
            quoted = '`' + name.replace('`', '``') + '`'
            cursor.execute(f"SHOW CREATE {'VIEW' if kind == 'VIEW' else 'TABLE'} {quoted}")
            definitions.append(cursor.fetchone()[1] + ';')
            if kind == 'BASE TABLE':
                cursor.execute(f"SELECT COUNT(*) FROM {quoted}")
                counts[name] = cursor.fetchone()[0]
        cursor.execute("SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()")
        routines = cursor.fetchall()
        for name, kind in routines:
            quoted = '`' + name.replace('`', '``') + '`'
            cursor.execute(f"SHOW CREATE {kind} {quoted}")
            definitions.append('DELIMITER $$\n' + cursor.fetchone()[2] + '$$\nDELIMITER ;')
        directory = Path('docs')
        directory.mkdir(exist_ok=True)
        (directory / 'schema_actual.sql').write_text('\n\n'.join(definitions) + '\n', encoding='utf-8')
        (directory / 'database_inventory.json').write_text(json.dumps({'version': version, 'counts': counts, 'objects': objects, 'routines': routines}, indent=2), encoding='utf-8')
        print('Estructura e inventario guardados en docs; sin cambios en MySQL.')
    finally:
        functions.close_database_connection(connection, cursor)


if __name__ == '__main__':
    main()
