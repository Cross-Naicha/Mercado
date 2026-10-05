"""Importe pagado opcional en observaciones de fraccionados."""
import functions
from database_backup import export_backup, save_backup

def main():
    c, db = functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='008_shelf_amount'")
        if c.fetchone():
            print('008 ya aplicada'); return
        print('Respaldo:', save_backup(export_backup()))
        c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='price_observations' AND COLUMN_NAME='amount_paid'")
        if not c.fetchone()[0]: c.execute('ALTER TABLE price_observations ADD COLUMN amount_paid DECIMAL(18,4) NULL')
        c.execute("INSERT INTO schema_migrations(version) VALUES('008_shelf_amount')")
        db.commit()
        print('Importe opcional disponible; observaciones anteriores conservadas.')
    finally: functions.close_database_connection(db,c)

if __name__=='__main__': main()
