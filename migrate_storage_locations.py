"""Varias ubicaciones informativas por producto, sin dividir el stock."""
import functions
from database_backup import export_backup,save_backup

def main():
 c,db=functions.connect_to_database()
 try:
  c.execute("SELECT version FROM schema_migrations WHERE version='011_storage_locations'")
  if c.fetchone(): print('011 ya aplicada'); return
  print('Respaldo:',save_backup(export_backup()))
  c.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='catalog_products' AND COLUMN_NAME='storage_locations'")
  if not c.fetchone()[0]: c.execute('ALTER TABLE catalog_products ADD COLUMN storage_locations JSON NULL')
  c.execute("UPDATE catalog_products SET storage_locations=JSON_ARRAY(JSON_OBJECT('location',storage_location,'detail',storage_detail,'role','daily')) WHERE storage_location<>'' AND storage_locations IS NULL")
  c.execute("INSERT INTO schema_migrations(version) VALUES('011_storage_locations')")
  db.commit();print('Ubicaciones anteriores conservadas.')
 finally: functions.close_database_connection(db,c)
if __name__=='__main__':main()
