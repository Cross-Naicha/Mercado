"""Migración 001: python migrate_foundation.py [--apply]. Sin --apply solo valida.

Importa compras históricas sin generar stock ni modificar tablas anteriores.
"""
import argparse
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from pathlib import Path
from uuid import UUID, uuid5

import functions

VERSION = '001_foundation'
NAMESPACE = UUID('c50db03a-37fb-4b15-9a70-872b93129f61')


def stable_id(kind, value):
    return str(uuid5(NAMESPACE, f'{kind}:{value}'))


def encode(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(type(value).__name__)


def decimal(value, places):
    return Decimal(str(value)).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def read_source(cursor):
    result = {}
    for table, key in [('products', 'id_product'), ('instances', 'id_instance')]:
        cursor.execute(f'SELECT * FROM {table} ORDER BY {key}')
        result[table] = cursor.fetchall()
    return result


def validate(source):
    ids = {p['id_product'] for p in source['products']}
    for row in source['instances']:
        if row['product_id'] not in ids:
            raise ValueError(f"Producto inexistente en instancia {row['id_instance']}")
        if row['quantity'] is None or decimal(row['quantity'], '.000001') <= 0:
            raise ValueError(f"Cantidad inválida en instancia {row['id_instance']}")
        if decimal(row['price'], '.0001') < 0 or row['obs_date'] is None:
            raise ValueError(f"Precio/fecha inválidos en instancia {row['id_instance']}")
        if row['is_promotion'] not in (0, 1):
            raise ValueError(f"Promoción inválida en instancia {row['id_instance']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    cursor, connection = functions.connect_to_database(True)
    try:
        cursor.execute("SELECT GET_LOCK('mercado_foundation_migration', 10) AS acquired")
        if cursor.fetchone()['acquired'] != 1:
            raise RuntimeError('Otra migración está en ejecución')
        cursor.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schema_migrations'")
        if cursor.fetchone()['n']:
            cursor.execute('SELECT version FROM schema_migrations WHERE version=%s', (VERSION,))
            if cursor.fetchone():
                print('Migración 001 ya aplicada; sin cambios.')
                return
        source = read_source(cursor)
        validate(source)
        print(f"Validación: {len(source['products'])} productos y {len(source['instances'])} compras históricas.")
        if not args.apply:
            print('Simulación terminada. Usar --apply para crear estructura e importar.')
            return

        # Respaldar y verificar antes de cualquier DDL; las tablas originales se conservan.
        backup = Path('backups') / datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        backup.mkdir(parents=True)
        raw = json.dumps(source, default=encode, ensure_ascii=False, indent=2)
        path = backup / 'legacy_data.json'
        path.write_text(raw, encoding='utf-8')
        assert json.loads(path.read_text(encoding='utf-8')) == json.loads(raw)
        from inspect_database import main as inspect_schema
        inspect_schema()
        (backup / 'legacy_schema.sql').write_bytes(Path('docs/schema_actual.sql').read_bytes())
        (backup / 'SHA256.txt').write_text(hashlib.sha256(path.read_bytes()).hexdigest() + '\n', encoding='utf-8')
        connection.commit()
        # MySQL confirma DDL automáticamente. Una interrupción puede dejar tablas vacías;
        # CREATE IF NOT EXISTS permite reintentar. Datos y marca se confirman juntos.
        for statement in Path('sql/001_foundation.sql').read_text(encoding='utf-8').split(';'):
            if statement.strip():
                cursor.execute(statement)
        connection.start_transaction()
        if read_source(cursor) != source:
            raise RuntimeError('Los datos cambiaron durante el respaldo; reintentar sin cargas concurrentes.')
        for p in source['products']:
            cursor.execute('INSERT INTO catalog_products (id,legacy_product_id,name,brand,category,product_type,product_subtype,legacy_presentation) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
                           (stable_id('product', p['id_product']), p['id_product'], p['product'], p['brand'], p['pclass'], p['ptype'], p['psubtype'], decimal(p['presentation'], '.000001') if p['presentation'] is not None else None))
        markets = sorted({r['market'] for r in source['instances'] if r['market']})
        for market in markets:
            cursor.execute('INSERT INTO store_branches (id,name,legacy_market) VALUES (%s,%s,%s)', (stable_id('branch', market), market, market))
        total = Decimal(0)
        for r in source['instances']:
            purchase = stable_id('purchase', r['id_instance'])
            quantity = decimal(r['quantity'], '.000001')
            price = decimal(r['price'], '.0001')
            paid = (quantity * price).quantize(Decimal('.0001'), rounding=ROUND_HALF_UP)
            total += paid
            cursor.execute('INSERT INTO purchases (id,branch_id,occurred_on,time_precision,legacy_instance_id,historical,needs_review) VALUES (%s,%s,%s,%s,%s,TRUE,TRUE)',
                           (purchase, stable_id('branch', r['market']) if r['market'] else None, r['obs_date'], 'date', r['id_instance']))
            cursor.execute('INSERT INTO purchase_lines (id,purchase_id,product_id,quantity,quantity_basis,total_paid,is_promotion,legacy_unit_price) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
                           (stable_id('line', r['id_instance']), purchase, stable_id('product', r['product_id']), quantity, 'legacy_unconfirmed', paid, r['is_promotion'], price))
        cursor.execute('SELECT COUNT(*) AS n FROM catalog_products WHERE legacy_product_id IS NOT NULL')
        assert cursor.fetchone()['n'] == len(source['products'])
        cursor.execute('SELECT COUNT(*) AS n, SUM(total_paid) AS total FROM purchase_lines')
        check = cursor.fetchone()
        assert check['n'] == len(source['instances']) and (check['total'] or Decimal(0)) == total
        assert read_source(cursor) == source
        cursor.execute('INSERT INTO schema_migrations (version) VALUES (%s)', (VERSION,))
        connection.commit()
        print(f'Migración confirmada. Respaldo: {backup}. Total histórico: {total} ARS. Sin stock generado.')
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.execute("SELECT RELEASE_LOCK('mercado_foundation_migration')")
        cursor.fetchone()
        functions.close_database_connection(connection, cursor)


if __name__ == '__main__':
    main()
