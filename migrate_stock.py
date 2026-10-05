"""Migración aditiva 002. No convierte compras históricas en existencias."""
from pathlib import Path
import functions


def main():
    c, db = functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='001_foundation'")
        if not c.fetchone():
            raise RuntimeError('Primero aplicar la migración 001')
        c.execute("SELECT version FROM schema_migrations WHERE version='002_stock'")
        if c.fetchone():
            print('002 ya aplicada; sin cambios')
            return
        # Respaldar todas las tablas antes de modificar la estructura.
        from database_backup import export_backup, save_backup
        print('Respaldo:', save_backup(export_backup()))
        c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='catalog_products' AND COLUMN_NAME='sale_mode'")
        if not c.fetchone()[0]:
            c.execute("ALTER TABLE catalog_products ADD COLUMN sale_mode ENUM('package','fractional','unit') NULL")
        for sql in Path('sql/002_stock.sql').read_text(encoding='utf-8').split(';'):
            if sql.strip(): c.execute(sql)
        c.execute("INSERT INTO schema_migrations(version) VALUES('002_stock')")
        db.commit()
        print('002 aplicada. Stock inicial vacío; históricos conservados.')
    finally:
        functions.close_database_connection(db,c)


if __name__ == '__main__': main()
