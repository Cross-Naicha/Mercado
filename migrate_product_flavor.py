"""Ubicación opcional de almacenamiento para cada producto."""
import functions
from database_backup import export_backup, save_backup

def main():
    c, db = functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='012_product_flavor'")
        if c.fetchone():
            print('012 ya aplicada'); return
        print('Respaldo:', save_backup(export_backup()))
        c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='catalog_products' AND COLUMN_NAME='flavor'")
        if not c.fetchone()[0]:
            c.execute("ALTER TABLE catalog_products ADD COLUMN flavor VARCHAR(255) NOT NULL DEFAULT ''")
        c.execute("INSERT INTO schema_migrations(version) VALUES('012_product_flavor')")
        db.commit()
        print('Sabor disponible; productos existentes en blanco.')
    finally:
        functions.close_database_connection(db,c)

if __name__=='__main__': main()
