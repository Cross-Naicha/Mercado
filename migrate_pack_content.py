"""Contenido opcional de cada unidad de un paquete, sin modificar existencias."""
import functions
from database_backup import export_backup, save_backup

def main():
    c, db = functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='007_pack_content'")
        if c.fetchone():
            print('007 ya aplicada'); return
        print('Respaldo:', save_backup(export_backup()))
        for name, definition in [('unit_content','DECIMAL(18,6) NULL'),('unit_content_unit',"ENUM('g','ml') NULL")]:
            c.execute('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND COLUMN_NAME=%s',('catalog_products',name))
            if not c.fetchone()[0]: c.execute(f'ALTER TABLE catalog_products ADD COLUMN {name} {definition}')
        c.execute("INSERT INTO schema_migrations(version) VALUES('007_pack_content')")
        db.commit()
        print('Contenido por unidad disponible; datos existentes conservados.')
    finally: functions.close_database_connection(db,c)

if __name__=='__main__': main()
