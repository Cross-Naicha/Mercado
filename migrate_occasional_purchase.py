"""Compras ocasionales sin catálogo ni existencias."""
import functions
from database_backup import export_backup, save_backup

def main():
    c, db = functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='013_occasional_purchase'")
        if c.fetchone():
            c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='purchases' AND COLUMN_NAME='cart_id'")
            if not c.fetchone()[0]:
                c.execute('ALTER TABLE purchases ADD COLUMN cart_id CHAR(36) NULL, ADD INDEX(cart_id)')
            return
        print('Respaldo:', save_backup(export_backup()))
        c.execute('''CREATE TABLE IF NOT EXISTS occasional_purchases (
            id CHAR(36) PRIMARY KEY, cart_id CHAR(36) NOT NULL,
            description VARCHAR(255) NOT NULL DEFAULT '',
            total_paid DECIMAL(18,2) NOT NULL,
            occurred_at DATETIME(6) NOT NULL, event_timezone VARCHAR(80) NOT NULL,
            received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            INDEX(cart_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
        c.execute('ALTER TABLE purchases ADD COLUMN cart_id CHAR(36) NULL, ADD INDEX(cart_id)')
        c.execute("INSERT INTO schema_migrations(version) VALUES('013_occasional_purchase')")
        db.commit()
        print('Compras ocasionales disponibles.')
    finally: functions.close_database_connection(db,c)

if __name__=='__main__': main()
