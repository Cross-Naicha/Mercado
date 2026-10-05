"""Precio de lista y condición de promoción para observaciones de góndola."""
import functions
from database_backup import export_backup,save_backup

def main():
    c,db=functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='005_shelf_prices'")
        if c.fetchone(): print('005 ya aplicada');return
        print('Respaldo:',save_backup(export_backup()))
        for column,definition in [('list_price','DECIMAL(18,4) NULL'),('promotion_code',"VARCHAR(20) NOT NULL DEFAULT 'none'")]:
            c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='price_observations' AND COLUMN_NAME=%s",(column,))
            if not c.fetchone()[0]: c.execute(f'ALTER TABLE price_observations ADD COLUMN {column} {definition}')
        c.execute("INSERT INTO schema_migrations(version) VALUES('005_shelf_prices')");db.commit()
        print('005 aplicada; compras y stock conservados.')
    finally: functions.close_database_connection(db,c)

if __name__=='__main__':main()
