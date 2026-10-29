"""Agrega el nombre corto de los locales sin modificar los existentes."""
import functions
from database_backup import export_backup, save_backup


def main():
    cursor, db = functions.connect_to_database()
    try:
        version = '016_branch_short_name'
        cursor.execute('SELECT version FROM schema_migrations WHERE version=%s', (version,))
        if cursor.fetchone():
            print('Nombre corto ya disponible')
            return
        print('Respaldo:', save_backup(export_backup()))
        cursor.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='store_branches' AND COLUMN_NAME='short_name'")
        if not cursor.fetchone()[0]:
            cursor.execute("ALTER TABLE store_branches ADD COLUMN short_name VARCHAR(3) NOT NULL DEFAULT ''")
        cursor.execute('INSERT INTO schema_migrations(version) VALUES(%s)', (version,))
        db.commit()
        print('Nombre corto disponible; completalo al editar cada local.')
    finally:
        functions.close_database_connection(db, cursor)


if __name__ == '__main__':
    main()
