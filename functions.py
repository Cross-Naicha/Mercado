import mysql.connector
from pydantic import BaseModel

# Constantes
DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = "alakazam"
DB_NAME = "mercado"

# Funciones: Conexión a la base de datos
def connect_to_database(cursor_dictionary=False):
    
    connection = mysql.connector.connect(
        host = DB_HOST,
        user = DB_USER,
        password = DB_PASSWORD,
        database = DB_NAME
    )
    cursor = connection.cursor(dictionary=cursor_dictionary)
    
    return cursor, connection

def close_database_connection(connection, cursor):
    cursor.close()
    connection.close()

# Funciones: Operaciones CRUD
def create_product(product): 

    sql = f"""
    call mercado.create_product(%s, %s, %s, %s, %s);
    """

    values = (product.product, product.brand, product.ptype, product.psubtype, product.presentation)

    cursor, connection = connect_to_database()

    cursor.execute(sql, values)
    connection.commit()

def create_instance(instance):

    sql = f"""
    call mercado.create_instance(%s, %s, %s, %s, %s);
    """

    values = instance.product_id, instance.quantity, instance.price, instance.is_promotion, instance.market

    cursor, connection = connect_to_database()

    cursor.execute(sql, values)
    connection.commit()

def read_product():

    QUERY = """SELECT * FROM mercado.v_last_prices;"""

    cursor, connection = connect_to_database(cursor_dictionary=True)

    cursor.execute(QUERY)
    result = cursor.fetchall()

    close_database_connection(connection, cursor)

    return result

def update_product():
    ...