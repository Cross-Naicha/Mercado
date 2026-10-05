"""Migración aditiva: etiqueta visible opcional, sin cambiar identificadores."""
import functions
from database_backup import export_backup, save_backup

def main():
    c, db=functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='004_labels'")
        if c.fetchone():
            print('004 ya aplicada; sin cambios'); return
        print('Respaldo:',save_backup(export_backup()))
        c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='catalog_products' AND COLUMN_NAME='display_label'")
        if not c.fetchone()[0]:
            c.execute('ALTER TABLE catalog_products ADD COLUMN display_label VARCHAR(255) NULL')
        c.execute("INSERT INTO schema_migrations(version) VALUES('004_labels')")
        db.commit()
        print('004 aplicada: etiquetas automáticas para productos existentes.')
    finally:
        functions.close_database_connection(db,c)

if __name__=='__main__': main()
