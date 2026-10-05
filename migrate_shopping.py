from pathlib import Path
import functions
from database_backup import export_backup,save_backup


def main():
    c,db=functions.connect_to_database()
    try:
        c.execute("SELECT version FROM schema_migrations WHERE version='002_stock'")
        if not c.fetchone(): raise RuntimeError('Aplicar primero 002_stock')
        c.execute("SELECT version FROM schema_migrations WHERE version='003_shopping'")
        if c.fetchone(): print('003 ya aplicada'); return
        print('Respaldo:',save_backup(export_backup()))
        for sql in Path('sql/003_shopping.sql').read_text(encoding='utf-8').split(';'):
            if sql.strip(): c.execute(sql)
        c.execute("INSERT INTO schema_migrations(version) VALUES('003_shopping')")
        db.commit(); print('003 aplicada; catálogo e historial conservados')
    finally: functions.close_database_connection(db,c)


if __name__=='__main__': main()
