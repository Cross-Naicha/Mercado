"""Regularidad de productos; todos los existentes comienzan como estables."""
import functions
from database_backup import export_backup, save_backup

def main():
    cursor, db = functions.connect_to_database()
    try:
        cursor.execute("SELECT version FROM schema_migrations WHERE version='014_stock_pattern'")
        if cursor.fetchone():
            print('014 ya aplicada')
            return
        print('Respaldo:', save_backup(export_backup()))
        cursor.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='catalog_products' AND COLUMN_NAME='stock_pattern'")
        if not cursor.fetchone()[0]:
            cursor.execute("ALTER TABLE catalog_products ADD COLUMN stock_pattern ENUM('stable','irregular') NOT NULL DEFAULT 'stable'")
        cursor.execute("INSERT INTO schema_migrations(version) VALUES('014_stock_pattern')")
        db.commit()
        print('Regularidad disponible; productos existentes estables.')
    finally:
        functions.close_database_connection(db,cursor)

if __name__=='__main__':
    main()
