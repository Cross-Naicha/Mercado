"""Respaldo completo; restaurar únicamente en una base NUEVA con --restore y --database."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import mysql.connector
import functions
from migrate_foundation import encode


def export_backup():
    c, db = functions.connect_to_database()
    try:
        db.start_transaction(consistent_snapshot=True)
        c.execute('SHOW FULL TABLES')
        objects=c.fetchall()
        result={'format':'mercado-backup-v1','source_database':functions.DB_NAME,'created_at':datetime.now().isoformat(),'tables':[], 'views':[], 'routines':[]}
        for name,kind in objects:
            quoted='`'+name.replace('`','``')+'`'
            c.execute(f"SHOW CREATE {'VIEW' if kind=='VIEW' else 'TABLE'} {quoted}")
            ddl=c.fetchone()[1]
            if kind=='VIEW': result['views'].append({'name':name,'ddl':ddl})
            else:
                c.execute(f'SELECT * FROM {quoted}')
                columns=[d[0] for d in c.description]
                result['tables'].append({'name':name,'ddl':ddl,'columns':columns,'rows':c.fetchall()})
        c.execute('SELECT ROUTINE_NAME,ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()')
        for name,kind in c.fetchall():
            c.execute(f'SHOW CREATE {kind} `{name}`')
            result['routines'].append({'kind':kind,'ddl':c.fetchone()[2]})
        return json.loads(json.dumps(result,default=encode))
    finally: functions.close_database_connection(db,c)


def save_backup(data):
    directory=Path('backups'); directory.mkdir(exist_ok=True)
    path=directory / ('full_'+datetime.now().strftime('%Y%m%d_%H%M%S_%f')+'.json')
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    assert json.loads(path.read_text(encoding='utf-8'))==data
    return path


def restore_backup(path, target):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}',target) or target.lower()==functions.DB_NAME.lower():
        raise ValueError('Elegí un nombre de base NUEVA, distinto de la base de uso')
    data=json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('format')!='mercado-backup-v1': raise ValueError('Formato no reconocido')
    db=mysql.connector.connect(host=functions.DB_HOST,user=functions.DB_USER,password=functions.DB_PASSWORD)
    c=db.cursor()
    try:
        c.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=%s',(target,))
        if c.fetchone(): raise ValueError('La base destino ya existe; no se sobrescribe')
        c.execute(f'CREATE DATABASE `{target}` CHARACTER SET utf8mb4')
        c.execute(f'USE `{target}`')
        c.execute('SET FOREIGN_KEY_CHECKS=0')
        def definition(sql):
            sql=re.sub(r'DEFINER\s*=\s*`[^`]*`@`[^`]*`','',sql)
            return sql.replace('`'+data['source_database']+'`.','`'+target+'`.')
        for table in data['tables']:
            c.execute(definition(table['ddl']))
            if table['rows']:
                fields=','.join('`'+s.replace('`','``')+'`' for s in table['columns'])
                sql=f"INSERT INTO `{table['name']}` ({fields}) VALUES ({','.join(['%s']*len(table['columns']))})"
                c.executemany(sql,table['rows'])
        pending=list(data['views'])
        while pending:
            deferred=[]
            for view in pending:
                try: c.execute(definition(view['ddl']))
                except mysql.connector.Error as error:
                    if error.errno!=1146: raise
                    deferred.append(view)
            if len(deferred)==len(pending): raise RuntimeError('No se pudieron resolver las dependencias entre vistas')
            pending=deferred
        for routine in data['routines']: c.execute(definition(routine['ddl']))
        c.execute('SET FOREIGN_KEY_CHECKS=1')
        for table in data['tables']:
            c.execute(f"SELECT COUNT(*) FROM `{table['name']}`")
            if c.fetchone()[0]!=len(table['rows']): raise RuntimeError('Conteo restaurado incorrecto')
            fields=','.join('`'+s.replace('`','``')+'`' for s in table['columns'])
            c.execute(f"SELECT {fields} FROM `{table['name']}`")
            restored=json.loads(json.dumps(c.fetchall(),default=encode))
            if sorted(json.dumps(row) for row in restored)!=sorted(json.dumps(row) for row in table['rows']): raise RuntimeError('Valores restaurados diferentes al respaldo')
        c.execute('SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=%s AND REFERENCED_TABLE_NAME IS NOT NULL',(target,))
        for table,col,parent,parent_col in c.fetchall():
            c.execute(f'SELECT COUNT(*) FROM `{table}` t LEFT JOIN `{parent}` p ON t.`{col}`=p.`{parent_col}` WHERE t.`{col}` IS NOT NULL AND p.`{parent_col}` IS NULL')
            if c.fetchone()[0]: raise RuntimeError('Referencias inválidas en base restaurada')
        db.commit()
        print('Restaurada y verificada por conteos, valores y referencias en',target,'; configuración activa sin cambios.')
    except Exception:
        db.rollback()
        raise  # DDL puede dejar una base parcial; nunca sustituye la base activa.
    finally: c.close(); db.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--restore'); parser.add_argument('--database')
    args=parser.parse_args()
    if args.restore:
        if not args.database: parser.error('--database es obligatorio')
        restore_backup(args.restore,args.database)
    else: print(save_backup(export_backup()))
