"""Unifica los supermercados y locales indicados por el usuario."""
import json
import re
import unicodedata
from database_backup import export_backup, save_backup
import functions


def group(value):
    text = unicodedata.normalize('NFD', value or '')
    text = ''.join(char for char in text if not unicodedata.combining(char)).lower()
    if re.search(r'\bgomez\s+pardo\b', text):
        return 'gomez'
    if re.search(r'\bvea\b', text):
        return 'vea'
    return None


def main():
    backup = save_backup(export_backup())
    print('Respaldo:', backup)
    cursor, connection = functions.connect_to_database(True)
    try:
        connection.start_transaction()
        cursor.execute('SELECT * FROM store_branches FOR UPDATE')
        branches = cursor.fetchall()
        counts = {}
        for table in ('instances', 'purchases', 'purchase_lines', 'price_observations', 'stock_lots', 'stock_movements'):
            cursor.execute(f'SELECT COUNT(*) n FROM {table}')
            counts[table] = cursor.fetchone()['n']
        result = []
        for key, name, address in [('gomez', 'Gómez Pardo', 'Yerba Buena'), ('vea', 'Vea', 'América y Belgrano')]:
            matches = [branch for branch in branches if group(branch['name']) == key or group(branch.get('legacy_market')) == key]
            if not matches:
                raise ValueError(f'No se encontró {name}')
            canonical = next((branch for branch in matches if branch.get('legacy_market') == ('gomez pardo' if key == 'gomez' else 'vea')), matches[0])
            label = name + ' · ' + address
            for branch in matches:
                if branch['id'] == canonical['id']:
                    continue
                cursor.execute('SELECT id FROM shopping_documents WHERE owner_id=%s', (branch['id'],))
                if cursor.fetchone():
                    raise ValueError('Un local duplicado tiene un mapa: requiere combinarlo antes de unificar')
                for table in ('purchases', 'price_observations'):
                    cursor.execute(f'UPDATE {table} SET branch_id=%s WHERE branch_id=%s', (canonical['id'], branch['id']))
                cursor.execute('UPDATE store_branches SET name=%s,address=%s,location_confirmed=TRUE,deleted_at=COALESCE(deleted_at,NOW()),revision=revision+1 WHERE id=%s', (name, address, branch['id']))
            cursor.execute('UPDATE store_branches SET name=%s,address=%s,location_confirmed=TRUE,deleted_at=NULL,revision=revision+1 WHERE id=%s', (name, address, canonical['id']))
            cursor.execute('SELECT id_instance,market FROM instances')
            ids = [row['id_instance'] for row in cursor.fetchall() if group(row['market']) == key]
            for instance_id in ids:
                cursor.execute('UPDATE instances SET market=%s WHERE id_instance=%s', (label, instance_id))
            result.append({'supermercado': name, 'local': address, 'referencias_historicas': len(ids), 'locales_unificados': len(matches)})
        for table, expected in counts.items():
            cursor.execute(f'SELECT COUNT(*) n FROM {table}')
            if cursor.fetchone()['n'] != expected:
                raise ValueError(f'Cambió la cantidad de registros en {table}')
        connection.commit()
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


if __name__ == '__main__':
    main()
