"""Conservar descripción libre de promociones de compras."""
import functions
from database_backup import export_backup,save_backup

def main():
    c,db=functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='006_special_promotions'")
        if c.fetchone(): print('006 ya aplicada');return
        print('Respaldo:',save_backup(export_backup()))
        c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='purchase_lines' AND COLUMN_NAME='promotion_description'")
        if not c.fetchone()[0]: c.execute('ALTER TABLE purchase_lines ADD COLUMN promotion_description VARCHAR(500) NULL')
        c.execute("INSERT INTO schema_migrations(version) VALUES('006_special_promotions')");db.commit();print('006 aplicada.')
    finally: functions.close_database_connection(db,c)

if __name__=='__main__':main()
